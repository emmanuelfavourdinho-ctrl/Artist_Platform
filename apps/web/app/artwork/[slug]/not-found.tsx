import Link from 'next/link';

export default function ArtworkNotFound() {
  return (
    <main className="mx-auto flex max-w-content flex-col items-center px-gutter py-32 text-center">
      <p className="font-display text-2xl text-foreground">This piece isn&apos;t here anymore.</p>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
        It may have sold, been removed, or the link might be out of date.
      </p>
      <Link
        href="/gallery"
        className="mt-8 rounded-full border border-foreground/25 px-6 py-2.5 text-[13px] font-medium uppercase tracking-[0.12em] text-foreground transition-colors duration-200 hover:border-accent hover:text-accent"
      >
        Back to the collection
      </Link>
    </main>
  );
}
