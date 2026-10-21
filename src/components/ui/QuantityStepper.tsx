import { Minus, Plus, Trash2 } from 'lucide-react';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Mostra lixeira no lugar do "-" quando chega em 1. */
  removable?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 30,
  removable = false,
  label = 'Quantidade',
  size = 'md',
}: QuantityStepperProps) {
  const showTrash = removable && value <= min;
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-night-900/12 bg-white p-1"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onClick={() => onChange(showTrash ? 0 : Math.max(min, value - 1))}
        aria-label={showTrash ? 'Remover item' : 'Diminuir quantidade'}
        className={`${box} flex items-center justify-center rounded-full text-night-900/70 transition
                    hover:bg-night-900/5 hover:text-night-900`}
      >
        {showTrash ? <Trash2 size={15} /> : <Minus size={15} />}
      </button>

      <span
        className="min-w-[1.75rem] text-center text-sm font-bold tabular-nums"
        aria-live="polite"
        aria-atomic="true"
      >
        {value}
      </span>

      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Aumentar quantidade"
        className={`${box} flex items-center justify-center rounded-full bg-gold-400 text-night-950 transition
                    hover:bg-gold-300 disabled:opacity-40`}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
