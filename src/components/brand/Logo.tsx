interface LogoProps {
  /** `light` = logo usada sobre fundo escuro; `dark` = sobre fundo claro. */
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Altura da arte em px. A largura acompanha a proporção original (106×77). */
const HEIGHTS = { sm: 30, md: 42, lg: 62 } as const;
const ASPECT = 106 / 77;

const SRC = '/images/marca/tortinni-logo.webp';
const SRC_2X = '/images/marca/tortinni-logo@2x.webp';
const FALLBACK = '/images/marca/tortinni-logo.png';

/**
 * Logotipo oficial da Tortinni.
 *
 * O "salgados" e as estrelas são verde-escuro, então sobre fundo escuro a arte
 * vai sobre uma placa creme — o mesmo fundo claro em que a marca foi desenhada.
 */
export function Logo({ variant = 'light', size = 'md', className = '' }: LogoProps) {
  const height = HEIGHTS[size];
  const width = Math.round(height * ASPECT);
  const onDark = variant === 'light';

  const art = (
    <picture>
      <source srcSet={`${SRC} 1x, ${SRC_2X} 2x`} type="image/webp" />
      <img
        src={FALLBACK}
        alt="Tortinni Salgados"
        width={width}
        height={height}
        style={{ height, width }}
        decoding="async"
        className="block object-contain"
      />
    </picture>
  );

  if (!onDark) {
    return <span className={`inline-flex items-center ${className}`}>{art}</span>;
  }

  return (
    <span
      className={`inline-flex items-center rounded-lg bg-cream px-2 py-1 shadow-sm
                  ring-1 ring-white/10 ${className}`}
    >
      {art}
    </span>
  );
}
