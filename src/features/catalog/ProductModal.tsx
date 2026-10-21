import { useEffect, useState } from 'react';
import { ShoppingBag, Users } from 'lucide-react';
import type { Product } from '@/types/catalog';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { ProductImage } from '@/components/ui/ProductImage';
import { formatBRL } from '@/utils/format';
import { ComboBuilder } from './ComboBuilder';
import { useCart, type CartSelection } from '@/features/cart/CartContext';

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
}

export function ProductModal({ product, onClose }: ProductModalProps) {
  const { addItem, open: openCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<CartSelection[]>([]);
  const [comboValid, setComboValid] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setQuantity(1);
    setSelections([]);
    setComboValid(false);
    setNotes('');
  }, [product?.id]);

  if (!product) return null;

  const isCombo = product.kind === 'combo';
  const canAdd = product.isAvailable && (!isCombo || comboValid);

  // Soma os acréscimos das escolhas ao preço do combo.
  const extraCents = selections.reduce((sum, selection) => {
    const group = product.comboGroups?.find((g) => g.id === selection.groupId);
    if (!group) return sum;
    return (
      sum +
      selection.optionProductIds.reduce((inner, id) => {
        const option = group.options.find((o) => o.productId === id);
        return inner + (option?.extraPriceCents ?? 0);
      }, 0)
    );
  }, 0);

  const unitCents = product.currentPriceCents + extraCents;

  function handleAdd() {
    if (!product || !canAdd) return;
    addItem(product, { quantity, selections, notes: notes.trim() || undefined });
    onClose();
    openCart();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={product.name}
      size={isCombo ? 'lg' : 'md'}
      footer={
        <div className="flex items-center gap-3">
          <QuantityStepper value={quantity} onChange={setQuantity} />
          <Button size="lg" onClick={handleAdd} disabled={!canAdd} fullWidth className="flex-1">
            <ShoppingBag size={17} aria-hidden="true" />
            Adicionar · {formatBRL(unitCents * quantity)}
          </Button>
        </div>
      }
    >
      <div className="px-5 py-4">
        <div className="mb-4 flex gap-4">
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-gold-50 to-white ring-1 ring-night-900/5">
            <ProductImage
              src={product.imageUrl}
              alt={product.imageAlt}
              name={product.name}
              priority
              sizes="112px"
              className="h-full w-full object-contain p-2"
            />
          </div>

          <div className="min-w-0 flex-1">
            {product.description && (
              <p className="text-sm leading-relaxed text-night-900/70 text-pretty">
                {product.description}
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="font-display text-xl font-extrabold text-brand-800">
                {formatBRL(product.currentPriceCents)}
              </span>
              {product.hasPromo && (
                <span className="text-sm text-night-900/40 line-through">
                  {formatBRL(product.priceCents)}
                </span>
              )}
              {product.serves && (
                <span className="chip bg-brand-50 text-brand-800">
                  <Users size={13} aria-hidden="true" /> Serve {product.serves}
                </span>
              )}
            </div>
          </div>
        </div>

        {isCombo && (
          <div className="mb-4">
            <ComboBuilder
              product={product}
              onChange={(next, valid) => {
                setSelections(next);
                setComboValid(valid);
              }}
            />
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-night-900">
            Observação <span className="font-normal text-night-900/45">(opcional)</span>
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value.slice(0, 200))}
            rows={2}
            placeholder="Ex.: sem cebola, entregar na portaria…"
            className="w-full resize-none rounded-xl border border-night-900/12 bg-white px-3 py-2.5 text-sm
                       placeholder:text-night-900/30 focus:border-gold-400"
          />
        </label>
      </div>
    </Modal>
  );
}
