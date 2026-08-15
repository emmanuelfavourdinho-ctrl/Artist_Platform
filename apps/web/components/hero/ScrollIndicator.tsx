export function ScrollIndicator() {
  return (
    <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-2 sm:flex">
      <span className="text-[10px] font-medium uppercase tracking-[0.3em] text-foreground/50">
        Scroll
      </span>
      <span className="h-8 w-px animate-scroll-bob bg-foreground/40" />
    </div>
  );
}
