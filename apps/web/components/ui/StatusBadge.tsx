export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const TONE_STYLES: Record<StatusTone, string> = {
  success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  error: 'bg-red-500/10 text-red-600 border-red-500/20',
  info: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  neutral: 'bg-foreground/10 text-muted border-foreground/20',
};

/**
 * A single, reusable treatment for "state of a thing" across the app —
 * account status, commission status, order status, moderation status,
 * etc. Never communicates meaning through color alone: the label text
 * always ships alongside the color (see docs/architecture.md-style note
 * in the platform brief on accessibility — color can't be the only
 * signal).
 */
export function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${TONE_STYLES[tone]}`}
    >
      {label}
    </span>
  );
}
