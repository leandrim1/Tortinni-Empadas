import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { priceCart, type PricedCart } from '@shared/pricing';
import type { Product } from '@/types/catalog';

const STORAGE_KEY = 'tortinni:carrinho:v1';
const MAX_QUANTITY = 30;

export interface CartSelection {
  groupId: string;
  groupTitle: string;
  optionProductIds: string[];
}

export interface CartLine {
  /** Chave local da linha: o mesmo produto com escolhas diferentes vira outra linha. */
  lineId: string;
  productId: string;
  quantity: number;
  selections: CartSelection[];
  notes?: string;
}

interface PersistedCart {
  version: 1;
  lines: CartLine[];
}

interface CartContextValue {
  lines: CartLine[];
  /** Carrinho precificado com a mesma engine usada pelo servidor. */
  priced: PricedCart;
  itemCount: number;
  isOpen: boolean;
  lastAdded: string | null;
  open: () => void;
  close: () => void;
  addItem: (product: Product, options?: { quantity?: number; selections?: CartSelection[]; notes?: string }) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
  productFor: (productId: string) => Product | undefined;
}

const CartContext = createContext<CartContextValue | null>(null);

function loadPersisted(): CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedCart;
    if (parsed.version !== 1 || !Array.isArray(parsed.lines)) return [];
    return parsed.lines.filter(
      (line) => typeof line.productId === 'string' && Number.isInteger(line.quantity) && line.quantity > 0,
    );
  } catch {
    // Carrinho corrompido no storage não pode derrubar a loja.
    return [];
  }
}

/** Identidade da linha: produto + escolhas + observação. */
function signatureOf(productId: string, selections: CartSelection[], notes?: string): string {
  const choices = [...selections]
    .sort((a, b) => a.groupId.localeCompare(b.groupId))
    .map((selection) => `${selection.groupId}:${[...selection.optionProductIds].sort().join('+')}`)
    .join('|');
  return `${productId}#${choices}#${notes ?? ''}`;
}

export function CartProvider({
  children,
  catalog,
}: {
  children: ReactNode;
  catalog: Product[];
}) {
  const [lines, setLines] = useState<CartLine[]>(loadPersisted);
  const [isOpen, setIsOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  // Persistência: atualizar a página ou navegar não pode esvaziar o carrinho.
  useEffect(() => {
    try {
      const payload: PersistedCart = { version: 1, lines };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Modo privado sem storage: o carrinho segue funcionando na memória.
    }
  }, [lines]);

  const productFor = useCallback(
    (productId: string) => catalog.find((product) => product.id === productId),
    [catalog],
  );

  const addItem: CartContextValue['addItem'] = useCallback(
    (product, options = {}) => {
      const quantity = Math.min(MAX_QUANTITY, Math.max(1, options.quantity ?? 1));
      const selections = options.selections ?? [];
      const signature = signatureOf(product.id, selections, options.notes);

      setLines((current) => {
        const existing = current.find(
          (line) => signatureOf(line.productId, line.selections, line.notes) === signature,
        );
        if (existing) {
          return current.map((line) =>
            line.lineId === existing.lineId
              ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + quantity) }
              : line,
          );
        }
        return [
          ...current,
          {
            lineId: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            productId: product.id,
            quantity,
            selections,
            notes: options.notes,
          },
        ];
      });

      setLastAdded(product.id);
      window.setTimeout(() => setLastAdded((value) => (value === product.id ? null : value)), 1600);
    },
    [],
  );

  const setQuantity = useCallback((lineId: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.lineId !== lineId)
        : current.map((line) =>
            line.lineId === lineId
              ? { ...line, quantity: Math.min(MAX_QUANTITY, quantity) }
              : line,
          ),
    );
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines((current) => current.filter((line) => line.lineId !== lineId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const priced = useMemo(() => {
    const products = new Map(catalog.map((product) => [product.id, product]));
    return priceCart(
      lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        selections: line.selections.map((selection) => ({
          groupId: selection.groupId,
          optionProductIds: selection.optionProductIds,
        })),
        notes: line.notes,
      })),
      { products, minOrderCents: 2000 },
    );
  }, [lines, catalog]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      priced,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      isOpen,
      lastAdded,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      addItem,
      setQuantity,
      removeLine,
      clear,
      productFor,
    }),
    [lines, priced, isOpen, lastAdded, addItem, setQuantity, removeLine, clear, productFor],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart precisa estar dentro de <CartProvider>.');
  return context;
}
