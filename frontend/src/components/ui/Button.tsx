'use client';

import React from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary border-on-primary shadow-[4px_4px_0_var(--on-primary)] ' +
    'hover:shadow-[6px_6px_0_var(--on-primary)] hover:-translate-x-0.5 hover:-translate-y-0.5 ' +
    'active:shadow-[1px_1px_0_var(--on-primary)] active:translate-x-0.5 active:translate-y-0.5',
  secondary: 'bg-surface-2 text-ink border-line-strong hover:bg-line',
  ghost: 'bg-transparent text-ink-dim border-transparent hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger text-[#2a0a0a] border-[#2a0a0a] hover:brightness-110',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leadingIcon,
    trailingIcon,
    fullWidth = false,
    className = '',
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center border font-bold uppercase tracking-wide',
        'transition-[transform,box-shadow,background-color] duration-[var(--dur-fast)]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0',
        VARIANT[variant],
        SIZE[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? <Spinner size="sm" label={null} /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  );
});
