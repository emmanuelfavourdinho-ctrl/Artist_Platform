'use client';

interface GalleryErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GalleryError({ reset }: GalleryErrorProps) {
  return (
    <main className="mx-auto flex max-w-content flex-col items-center px-gutter py-32 text-center">
      <p className="font-display text-2xl text-foreground">Something went wrong.</p>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
        We couldn&apos;t load the collection right now. Please try again.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-8 rounded-full border border-foreground/25 px-6 py-2.5 text-[13px] font-medium uppercase tracking-[0.12em] text-foreground transition-colors duration-200 hover:border-accent hover:text-accent"
      >
        Try again
      </button>
    </main>
  );
}
