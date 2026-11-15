'use client';

import React, { useId } from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  /** Required, not optional: an unlabelled input is an accessibility defect. */
  label: string;
  hint?: string;
  error?: string;
  /** Hides the label visually but keeps it for screen readers. */
  hideLabel?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, hideLabel = false, className = '', ...rest },
  ref,
) {
  const generatedId = useId();
  const id = generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={
          hideLabel
            ? 'sr-only'
            : 'font-mono text-xs font-bold uppercase tracking-wider text-ink-dim'
        }
      >
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          'w-full bg-paper text-ink font-mono text-sm px-3.5 py-2.5',
          'border transition-colors duration-[var(--dur-fast)] placeholder:text-ink-dim',
          error ? 'border-danger' : 'border-line-strong focus:border-primary',
          className,
        ].join(' ')}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-dim">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-bold text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
