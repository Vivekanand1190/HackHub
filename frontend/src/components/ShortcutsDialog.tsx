'use client';

import React, { useEffect, useRef } from 'react';

interface Shortcut {
  keys: string[];
  label: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['⌘', 'K'], label: 'Open the command palette' },
  { keys: ['?'], label: 'Show this shortcut sheet' },
  { keys: ['Esc'], label: 'Close the palette or this sheet' },
];

export interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-line-strong bg-surface p-5 shadow-[6px_6px_0_var(--on-primary)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="shortcuts-title" className="text-base font-bold text-ink">Keyboard shortcuts</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close shortcut sheet"
            className="px-2 text-ink-dim hover:text-ink"
          >
            &#10005;
          </button>
        </div>

        <ul className="flex flex-col gap-2">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink-dim">{s.label}</span>
              <span className="flex flex-none items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="border border-line-strong bg-paper px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-dim">
          Tip: the command palette also jumps to any panel — type a name like &quot;kanban&quot; or &quot;chat&quot;.
        </p>
      </div>
    </div>
  );
}
