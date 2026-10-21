import { Link } from 'react-router-dom';
import { ShoppingBag, AlertTriangle, ArrowRight } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { ProductImage } from '@/components/ui/ProductImage';
import { formatBRL } from '@/utils/format';
import { useCart } from './CartContext';

export function CartDrawer() {
  const { isOpen, close, lines, priced, setQuantity, productFor, clear } = useCart();

  const subtotal = priced.subtotalCents;
  const missing = priced.missingForMinimumCents;

  return (
    <Drawer
      open={isOpen}
      onClose={close}
      title="Seu pedido"
      footer={
        lines.length > 0 ? (
          <div className="space-y-3">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-night-900/60">Subtotal</dt>
                <dd className="font-semibold tabular-nums">{formatBRL(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-night-900/60">Taxa de entrega</dt>
                <dd className="text-night-900/50">Calculada no checkout</dd>
              </div>
            </dl>

            {!priced.meetsMinimum && (
              <p className="flex items-start gap-2 rounded-xl bg-gold-50 px-3 py-2.5 text-xs text-gold-900">
                <AlertTriangle size={15} className="mt-px shrink-0" aria-hidden="true" />
                <span>
                  Pedido mínimo de <strong>{formatBRL(priced.minOrderCents)}</strong>. Faltam{' '}
                  <strong>{formatBRL(missing)}</strong> para fechar.
                </span>
              </p>
            )}

            <ButtonLink
              to="/checkout"
              size="lg"
              fullWidth
              onClick={close}
              className={!priced.meetsMinimum ? 'pointer-events-none opacity-50' : ''}
            >
              Finalizar pedido
              <ArrowRight size={17} aria-hidden="true" />
            </ButtonLink>

            <div className="flex items-center justify-between">
              <Link
                to="/cardapio"
                onClick={close}
                className="text-sm font-semibold text-brand-700 link-underline"
              >
                Continuar comprando
              </Link>
              <button
                type="button"
                onClick={clear}
                className="text-xs font-medium text-night-900/40 transition hover:text-crust"
              >
                Esvaziar
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      {lines.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Seu carrinho está vazio"
          description="Escolha suas empadas favoritas e monte um combo para economizar."
          action={
            <ButtonLink to="/cardapio" onClick={close} size="md">
              Ver cardápio
            </ButtonLink>
          }
        />
      ) : (
        <ul className="divide-y divide-night-900/8">
          {lines.map((line, index) => {
            const product = productFor(line.productId);
            const pricedItem = priced.items[index];
            if (!product) return null;

            return (
              <li key={line.lineId} className="flex gap-3 p-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gold-50 ring-1 ring-night-900/5">
                  <ProductImage
                    src={product.imageUrl}
                    alt={product.imageAlt}
                    name={product.name}
                    sizes="64px"
                    className="h-full w-full object-contain p-1"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-snug text-night-900">{product.name}</p>

                  {line.selections.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {line.selections.map((selection) => (
                        <li key={selection.groupId} className="text-xs text-night-900/55">
                          <span className="font-medium">{selection.groupTitle}:</span>{' '}
                          {summarize(selection.optionProductIds, productFor)}
                        </li>
                      ))}
                    </ul>
                  )}

                  {line.notes && (
                    <p className="mt-1 text-xs italic text-night-900/50">“{line.notes}”</p>
                  )}

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <QuantityStepper
                      value={line.quantity}
                      onChange={(value) => setQuantity(line.lineId, value)}
                      removable
                      size="sm"
                    />
                    <span className="font-display text-sm font-extrabold tabular-nums text-brand-800">
                      {formatBRL(pricedItem?.totalCents ?? product.currentPriceCents * line.quantity)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}

/** "Empada cheddar ×2 · Guaraná" — agrupa repetições em vez de listar duplicado. */
function summarize(
  optionProductIds: string[],
  productFor: (id: string) => { name: string } | undefined,
): string {
  const counts = new Map<string, number>();
  for (const id of optionProductIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  return [...counts.entries()]
    .map(([id, count]) => {
      const name = productFor(id)?.name ?? 'Item';
      return count > 1 ? `${name} ×${count}` : name;
    })
    .join(' · ');
}
