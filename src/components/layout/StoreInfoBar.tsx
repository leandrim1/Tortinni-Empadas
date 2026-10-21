import { Star, Clock, BadgeDollarSign, CircleDot } from 'lucide-react';
import type { StorePayload } from '@/types/catalog';
import { formatBRL, formatEta } from '@/utils/format';

interface StoreInfoBarProps {
  store: StorePayload;
  tone?: 'light' | 'dark';
}

/**
 * Faixa com os dados operacionais da loja.
 * A nota só aparece quando a loja informa a avaliação real — nada é inventado.
 */
export function StoreInfoBar({ store, tone = 'light' }: StoreInfoBarProps) {
  const dark = tone === 'dark';
  const base = dark ? 'text-cream/80' : 'text-night-900/70';
  const strong = dark ? 'text-cream' : 'text-night-900';
  const divider = dark ? 'bg-white/15' : 'bg-night-900/10';

  const { store: info, status } = store;

  return (
    <dl className={`flex flex-wrap items-center gap-x-5 gap-y-3 text-sm ${base}`}>
      <div className="flex items-center gap-2">
        <span
          className={`flex h-2.5 w-2.5 items-center justify-center rounded-full ${
            status.isOpen ? 'bg-brand-400' : 'bg-crust'
          }`}
          aria-hidden="true"
        >
          {status.isOpen && <span className="h-2.5 w-2.5 animate-ping rounded-full bg-brand-400/70" />}
        </span>
        <dt className="sr-only">Situação</dt>
        <dd className={`font-bold ${status.isOpen ? (dark ? 'text-brand-300' : 'text-brand-700') : 'text-crust'}`}>
          {status.isOpen ? 'Aberto agora' : status.message}
        </dd>
      </div>

      <span className={`hidden h-4 w-px sm:block ${divider}`} aria-hidden="true" />

      {info.rating ? (
        <div className="flex items-center gap-1.5">
          <Star size={15} className="fill-gold-400 text-gold-400" aria-hidden="true" />
          <dt className="sr-only">Avaliação</dt>
          <dd className={`font-bold ${strong}`}>
            {info.rating.value}
            {info.rating.count != null && (
              <span className="ml-1 font-normal opacity-60">({info.rating.count})</span>
            )}
          </dd>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <CircleDot size={15} className="opacity-50" aria-hidden="true" />
          <dt className="sr-only">Avaliação</dt>
          <dd className="opacity-60">Avaliações em breve</dd>
        </div>
      )}

      <span className={`hidden h-4 w-px sm:block ${divider}`} aria-hidden="true" />

      <div className="flex items-center gap-1.5">
        <Clock size={15} aria-hidden="true" />
        <dt className="sr-only">Tempo estimado de entrega</dt>
        <dd className={`font-semibold ${strong}`}>
          {formatEta(info.etaMinMinutes, info.etaMaxMinutes)}
        </dd>
      </div>

      <span className={`hidden h-4 w-px sm:block ${divider}`} aria-hidden="true" />

      <div className="flex items-center gap-1.5">
        <BadgeDollarSign size={15} aria-hidden="true" />
        <dt className="sr-only">Pedido mínimo</dt>
        <dd>
          Pedido mínimo <span className={`font-semibold ${strong}`}>{formatBRL(info.minOrderCents)}</span>
        </dd>
      </div>
    </dl>
  );
}
