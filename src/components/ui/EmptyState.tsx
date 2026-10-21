import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'light' | 'dark';
}

export function EmptyState({ icon: Icon, title, description, action, tone = 'light' }: EmptyStateProps) {
  const isDark = tone === 'dark';
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-full ${
          isDark ? 'bg-white/10 text-gold-300' : 'bg-gold-100 text-gold-700'
        }`}
      >
        <Icon size={24} aria-hidden="true" />
      </span>
      <h3 className={`font-display text-lg font-bold ${isDark ? 'text-cream' : 'text-night-900'}`}>
        {title}
      </h3>
      {description && (
        <p className={`max-w-xs text-sm text-pretty ${isDark ? 'text-cream/65' : 'text-night-900/60'}`}>
          {description}
        </p>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
