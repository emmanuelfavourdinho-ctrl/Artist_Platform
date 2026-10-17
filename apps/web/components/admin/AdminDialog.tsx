'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/*
  Explainer: an accessible modal for sensitive admin actions. It moves
  focus into the dialog when it opens, keeps Tab inside it, closes on
  Escape (unless a request is in flight), and returns focus to whatever
  opened it. Used for every enforcement / role change so the "confirm and
  give a reason" step looks and behaves the same everywhere.
*/
export function AdminDialog({
  title,
  description,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const focusable = () =>
      root?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      ) ?? [];
    focusable()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...focusable()];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
    // Re-bind only when `busy` changes; onClose identity is irrelevant here.
  }, [busy]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-dialog-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border/15 bg-surface p-6"
      >
        <h2 id="admin-dialog-title" className="font-display text-xl text-foreground">
          {title}
        </h2>
        {description && <p className="mt-2 text-sm text-muted">{description}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
