import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * The shared empty state. Ten panels used to hand-roll their own, each with a
 * different tone and size; this is the single version.
 */
export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className}`}
    >
      {icon && <div className="text-ink-dim opacity-60" aria-hidden="true">{icon}</div>}
      <p className="font-bold text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-dim">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
