interface LogoProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { mark: 32, title: 'text-lg', sub: 'text-[9px]' },
  md: { mark: 40, title: 'text-xl', sub: 'text-[10px]' },
  lg: { mark: 56, title: 'text-3xl', sub: 'text-xs' },
} as const;

/**
 * Marca da Tortinni: chapéu de chef entre estrelas, tipografia dourada com
 * contorno verde — as cores do logotipo da loja.
 */
export function Logo({ variant = 'light', size = 'md', className = '' }: LogoProps) {
  const s = SIZES[size];
  const titleColor = variant === 'light' ? 'text-gold-300' : 'text-brand-900';
  const subColor = variant === 'light' ? 'text-cream/70' : 'text-brand-700/80';

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={s.mark}
        height={s.mark}
        viewBox="0 0 64 64"
        aria-hidden="true"
        className="shrink-0 drop-shadow-sm"
      >
        <circle cx="32" cy="32" r="31" className="fill-brand-900" />
        <path
          d="M20 29c-4.4 0-8-3.1-8-7s3.6-7 8-7c1.3-4.1 5.7-7 10.9-7s9.6 2.9 10.9 7c4.4 0 8 3.1 8 7s-3.6 7-8 7z"
          className="fill-cream"
        />
        <rect x="19" y="27.5" width="26" height="6" rx="2" className="fill-gold-200" />
        <path
          d="M18 42c0-6.1 6.3-11 14-11s14 4.9 14 11v3a3 3 0 0 1-3 3H21a3 3 0 0 1-3-3z"
          className="fill-gold-400"
        />
        <circle cx="27" cy="40" r="1.8" className="fill-brand-950" />
        <circle cx="37" cy="40" r="1.8" className="fill-brand-950" />
        <path
          d="M28 44.5c1.2 1.4 2.5 2 4 2s2.8-.6 4-2"
          className="stroke-brand-950"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M9 19l1.3 2.8 3 .4-2.2 2.1.6 3L9 25.9 6.3 27.3l.6-3-2.2-2.1 3-.4z" className="fill-brand-400" />
        <path d="M55 19l1.3 2.8 3 .4-2.2 2.1.6 3L55 25.9l-2.7 1.4.6-3-2.2-2.1 3-.4z" className="fill-brand-400" />
      </svg>

      <span className="flex flex-col leading-none">
        <span className={`font-display font-extrabold tracking-wide ${s.title} ${titleColor}`}>
          TORTINNI
        </span>
        <span className={`font-display font-semibold uppercase tracking-[0.3em] ${s.sub} ${subColor}`}>
          salgados
        </span>
      </span>
    </span>
  );
}
