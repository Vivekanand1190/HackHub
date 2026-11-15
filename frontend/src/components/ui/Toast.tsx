'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Errors default to longer. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE: Record<ToastVariant, string> = {
  info: 'border-line-strong',
  success: 'border-success',
  error: 'border-danger',
};

const ACCENT: Record<ToastVariant, string> = {
  info: 'bg-ink-dim',
  success: 'bg-success',
  error: 'bg-danger',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      const variant = options.variant ?? 'info';
      const duration = options.duration ?? (variant === 'error' ? 8000 : 4500);

      setItems((prev) => [...prev, { ...options, variant, id }]);

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  // Never leave a timer running after unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.variant === 'error' ? 'alert' : 'status'}
            aria-live={item.variant === 'error' ? 'assertive' : 'polite'}
            className={`pointer-events-auto flex items-start gap-3 border bg-surface px-3 py-2.5 shadow-[4px_4px_0_var(--on-primary)] ${TONE[item.variant ?? 'info']}`}
          >
            <span className={`mt-1.5 h-2 w-2 flex-none ${ACCENT[item.variant ?? 'info']}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">{item.title}</p>
              {item.description && (
                <p className="mt-0.5 text-xs text-ink-dim">{item.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
              className="flex-none px-1 text-ink-dim hover:text-ink"
            >
              &#10005;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast() must be called inside a <ToastProvider>.');
  }
  return ctx;
}
