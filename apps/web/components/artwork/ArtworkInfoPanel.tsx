import Link from 'next/link';

import type { ArtworkDetail } from '../../lib/artworksApi';

const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD', // TODO: switch to artwork.currency once multi-currency display is needed
  maximumFractionDigits: 0,
});

function formatDimensions(dimensions: ArtworkDetail['dimensions']): string | null {
  const { width, height, depth } = dimensions;
  if (!width || !height) return null;
  const base = `${width} × ${height}`;
  return depth ? `${base} × ${depth} cm` : `${base} cm`;
}

export function ArtworkInfoPanel({ artwork }: { artwork: ArtworkDetail }) {
  const dimensions = formatDimensions(artwork.dimensions);
  const tags = [...artwork.mediums, ...artwork.styles, ...artwork.themes];

  return (
    <div className="flex flex-col">
      {artwork.categories[0] && (
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent">
          {artwork.categories[0].name}
        </p>
      )}

      <h1 className="mt-3 font-display text-3xl leading-tight text-foreground sm:text-4xl">
        {artwork.title}
      </h1>

      <Link
        href={`/artists/${artwork.artist.slug}`}
        className="mt-2 flex items-center gap-1.5 text-sm text-foreground/70 transition-colors hover:text-foreground"
      >
        {artwork.artist.name}
        {artwork.artist.verified && (
          <span aria-label="Verified artist" title="Verified artist" className="text-accent">
            ✓
          </span>
        )}
      </Link>

      <div className="mt-6 flex items-center gap-3">
        <span className="font-display text-2xl text-foreground">
          {priceFormatter.format(Number(artwork.price))}
        </span>
        {!artwork.available && (
          <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            Sold
          </span>
        )}
      </div>

      {/*
        Add to Cart / Favorite have no backend yet (cart/favorites were
        explicitly cut from this demo pass). Rather than fake a working
        button, these are disabled with an honest label — real UI
        structure, no fake success state, per the "don't fake
        transactions" rule.
      */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled
          title={artwork.available ? 'Cart coming soon' : 'This piece has sold'}
          className="flex-1 cursor-not-allowed rounded-full bg-foreground/15 px-7 py-3.5 text-sm font-medium text-foreground/50"
        >
          {artwork.available ? 'Add to Cart' : 'Sold'}
        </button>
        <button
          type="button"
          disabled
          title="Favorites coming soon"
          className="cursor-not-allowed rounded-full border border-foreground/15 px-7 py-3.5 text-sm font-medium text-foreground/40"
        >
          Favorite
        </button>
      </div>

      {artwork.description && (
        <div className="mt-10 border-t border-foreground/10 pt-8">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            About this artwork
          </h2>
          <p className="mt-3 text-sm leading-7 text-foreground/80">{artwork.description}</p>
        </div>
      )}

      <div className="mt-8 border-t border-foreground/10 pt-8">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          Artwork details
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          {artwork.yearCreated && (
            <>
              <dt className="text-foreground/60">Year</dt>
              <dd className="text-foreground">{artwork.yearCreated}</dd>
            </>
          )}
          {dimensions && (
            <>
              <dt className="text-foreground/60">Dimensions</dt>
              <dd className="text-foreground">{dimensions}</dd>
            </>
          )}
          {artwork.materials && (
            <>
              <dt className="text-foreground/60">Materials</dt>
              <dd className="text-foreground">{artwork.materials}</dd>
            </>
          )}
        </dl>

        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag.slug}
                className="rounded-full border border-foreground/15 px-3 py-1 text-xs text-foreground/70"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {artwork.artist.biography && (
        <div className="mt-8 border-t border-foreground/10 pt-8">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            About the artist
          </h2>
          <p className="mt-3 text-sm leading-7 text-foreground/80">{artwork.artist.biography}</p>
          <Link
            href={`/artists/${artwork.artist.slug}`}
            className="mt-4 inline-block text-sm font-medium text-accent underline underline-offset-2"
          >
            View Artist
          </Link>
        </div>
      )}
    </div>
  );
}
