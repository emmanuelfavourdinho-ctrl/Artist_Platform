import type { ReactNode } from 'react';

// Small shared pieces for admin pages. Deliberately plain: they exist so
// every admin page loads, fails, and renders "nothing here" the same way,
// not to be a design system.

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
        )}
        <h1 className="mt-1 font-display text-3xl text-foreground">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border/10 bg-surface p-5">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-lg bg-surface" />
      ))}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300"
    >
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/10"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyBox({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-lg border border-border/10 bg-surface px-6 py-10 text-center">
      <p className="text-sm text-foreground">{title}</p>
      {description && <p className="mt-1 text-xs text-muted">{description}</p>}
    </div>
  );
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    // Unknown/invalid currency code — show the number with the raw code
    // rather than throwing and blanking the whole page.
    return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
  }
}
