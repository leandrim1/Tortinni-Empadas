import { Plus, Check, Settings2 } from 'lucide-react';
import type { Product } from '@/types/catalog';
import { formatBRL } from '@/utils/format';
import { ProductImage } from '@/components/ui/ProductImage';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
  justAdded?: boolean;
  priority?: boolean;
}

export function ProductCard({ product, onSelect, onQuickAdd, justAdded, priority }: ProductCardProps) {
  const isCombo = product.kind === 'combo';
  const unavailable = !product.isAvailable;

  return (
    <article
      className={`card group relative flex flex-col overflow-hidden transition duration-300
                  hover:-translate-y-0.5 hover:shadow-lift ${unavailable ? 'opacity-70' : ''}`}
    >
      <button
        type="button"
        onClick={() => onSelect(product)}
        className="relative block aspect-square w-full overflow-hidden bg-gradient-to-b from-gold-50/60 to-white"
        aria-label={`Ver detalhes de ${product.name}`}
      >
        <ProductImage
          src={product.imageUrl}
          alt={product.imageAlt}
          name={product.name}
          priority={priority}
          className="h-full w-full object-contain p-3 transition duration-500 group-hover:scale-[1.06]"
        />

        <span className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
          {product.hasPromo && (
            <span className="chip bg-crust text-white shadow-sm">Promoção</span>
          )}
          {isCombo && !product.hasPromo && (
            <span className="chip bg-brand-700 text-cream shadow-sm">Combo</span>
          )}
          {product.serves && (
            <span className="chip bg-white/90 text-night-900 shadow-sm">
              Serve {product.serves}
            </span>
          )}
        </span>

        {unavailable && (
          <span className="absolute inset-0 flex items-center justify-center bg-night-950/55">
            <span className="chip bg-white text-night-900">Indisponível</span>
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-1 p-3 pt-2.5">
        <h3 className="line-clamp-2 font-display text-[15px] font-bold leading-snug text-night-900">
          {product.name}
        </h3>
        {product.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-night-900/55 text-pretty">
            {product.description}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
          <span className="flex flex-col leading-tight">
            {product.hasPromo && (
              <span className="text-[11px] text-night-900/40 line-through">
                {formatBRL(product.priceCents)}
              </span>
            )}
            <span className="font-display text-lg font-extrabold text-brand-800">
              {formatBRL(product.currentPriceCents)}
            </span>
          </span>

          <button
            type="button"
            disabled={unavailable}
            onClick={() => (isCombo ? onSelect(product) : onQuickAdd(product))}
            aria-label={
              isCombo ? `Montar ${product.name}` : `Adicionar ${product.name} ao carrinho`
            }
            className={`flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm
                        font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40
                        ${
                          justAdded
                            ? 'bg-brand-600 text-white'
                            : 'bg-gold-400 text-night-950 hover:bg-gold-300'
                        }`}
          >
            {justAdded ? (
              <>
                <Check size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Adicionado</span>
              </>
            ) : isCombo ? (
              <>
                <Settings2 size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Montar</span>
              </>
            ) : (
              <Plus size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
