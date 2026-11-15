import React from 'react';

const PADDING = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' } as const;

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Coral border for the one card on a screen that matters most. */
  emphasis?: boolean;
  padding?: keyof typeof PADDING;
  as?: 'div' | 'section' | 'article' | 'aside';
}

export function Card({
  emphasis = false,
  padding = 'md',
  as: Tag = 'div',
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={[
        'bg-surface',
        emphasis ? 'border border-primary' : 'border border-line',
        PADDING[padding],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  );
}
