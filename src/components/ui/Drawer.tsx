import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Painel lateral (carrinho). Vira folha inferior no celular. */
export function Drawer({ open, onClose, title, children, footer }: DrawerProps) {
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-night-950/70 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-full max-w-md flex-col bg-cream shadow-lift animate-slide-left"
      >
        <header className="flex items-center justify-between border-b border-night-900/10 bg-white px-5 py-4">
          <h2 className="font-display text-lg font-bold text-night-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar carrinho"
            className="rounded-full p-2 text-night-900/50 transition hover:bg-night-900/5 hover:text-night-900"
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {footer && (
          <footer className="border-t border-night-900/10 bg-white px-5 py-4 safe-bottom">{footer}</footer>
        )}
      </aside>
    </div>,
    document.body,
  );
}
