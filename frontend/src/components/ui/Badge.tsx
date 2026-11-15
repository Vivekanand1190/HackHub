import React from 'react';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warn' | 'danger' | 'link';

const TONE: Record<BadgeTone, string> = {
  neutral: 'border-line-strong text-ink-dim',
  primary: 'border-primary text-primary',
  success: 'border-success text-success',
  warn: 'border-warn text-warn',
  danger: 'border-danger text-danger',
  link: 'border-link text-link',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 border px-2 py-0.5',
        'font-mono text-[11px] font-bold uppercase tracking-wide',
        TONE[tone],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}
