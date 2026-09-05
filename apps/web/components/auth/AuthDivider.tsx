export function AuthDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-4">
      <span className="h-px flex-1 bg-foreground/10" aria-hidden="true" />
      <span className="text-xs uppercase tracking-widest text-muted">{label}</span>
      <span className="h-px flex-1 bg-foreground/10" aria-hidden="true" />
    </div>
  );
}
