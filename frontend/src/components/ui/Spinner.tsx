'use client';

const SIZE = { sm: 'h-3.5 w-3.5', md: 'h-5 w-5', lg: 'h-8 w-8' } as const;

export interface SpinnerProps {
  size?: keyof typeof SIZE;
  /** Announced to screen readers. Set to null for a purely decorative spinner. */
  label?: string | null;
  className?: string;
}

/**
 * Loading indicator. Motion is disabled globally under prefers-reduced-motion,
 * so this degrades to a static ring rather than spinning.
 */
export function Spinner({ size = 'md', label = 'Loading', className = '' }: SpinnerProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label ?? undefined}
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${SIZE[size]} ${className}`}
    />
  );
}
