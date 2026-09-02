import Link from 'next/link';

export default function ArtistNotFound() {
  return (
    <main className="mx-auto flex max-w-content flex-col items-center px-gutter py-32 text-center">
      <p className="font-display text-2xl text-foreground">We couldn&apos;t find this artist.</p>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
        The profile may have moved or the link is out of date.
      </p>
      <Link
        href="/gallery"
        className="mt-8 rounded-full border border-foreground/25 px-6 py-2.5 text-[13px] font-medium uppercase tracking-[0.12em] text-foreground transition-colors duration-200 hover:border-accent hover:text-accent"
      >
        Browse the collection
      </Link>
    </main>
  );
}
