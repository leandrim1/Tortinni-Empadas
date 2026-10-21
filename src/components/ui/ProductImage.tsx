import { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface ProductImageProps {
  src: string | null;
  alt: string | null;
  name: string;
  className?: string;
  /** Imagens acima da dobra carregam de imediato; o resto espera o scroll. */
  priority?: boolean;
  sizes?: string;
}

/**
 * Foto do produto com srcset responsivo e lazy loading.
 * Sem foto cadastrada, mostra um marcador honesto — nunca a foto de outro item.
 */
export function ProductImage({
  src,
  alt,
  name,
  className = '',
  priority = false,
  sizes = '(max-width: 640px) 45vw, 220px',
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-gold-50 to-cream text-center ${className}`}
        role="img"
        aria-label={`${name} — foto em breve`}
      >
        <ImageOff size={22} className="text-gold-600/60" aria-hidden="true" />
        <span className="px-2 text-[10px] font-semibold uppercase tracking-wide text-gold-700/70">
          Foto em breve
        </span>
      </div>
    );
  }

  const large = src.replace('-400', '-800');

  return (
    <img
      src={src}
      srcSet={`${src} 400w, ${large} 800w`}
      sizes={sizes}
      alt={alt ?? name}
      width={400}
      height={400}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
