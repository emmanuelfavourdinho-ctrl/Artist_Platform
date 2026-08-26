import Link from 'next/link';

import { CoverImage } from '../ui/CoverImage';
import type { ArtistArtworkSummary } from '../../lib/artistsApi';

const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function ArtistWorksGrid({
  artworks,
  artistName,
}: {
  artworks: ArtistArtworkSummary[];
  artistName: string;
}) {
  if (artworks.length === 0) {
    return <p className="mt-6 text-sm text-muted">No published works yet.</p>;
  }

  return (
    <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
      {artworks.map((artwork) => (
        <Link
          key={artwork.id}
          href={`/artwork/${artwork.slug}`}
          className="group relative block aspect-[4/5] overflow-hidden rounded-md focus-visible:outline-2"
          aria-label={`View ${artwork.title} by ${artistName}`}
        >
          <div className="h-full w-full transition-transform duration-700 ease-cinematic group-hover:scale-105">
            {artwork.image ? (
              <CoverImage
                src={artwork.image.url}
                alt={artwork.image.altText ?? artwork.title}
                sizes="(min-width: 1024px) 25vw, 50vw"
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-surface">
                <span className="text-[11px] uppercase tracking-[0.14em] text-muted">
                  Image coming soon
                </span>
              </div>
            )}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/10 to-transparent opacity-90 transition-opacity duration-500 group-hover:opacity-100" />
          {!artwork.available && (
            <span className="absolute left-3 top-3 rounded-full bg-background/85 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/80 backdrop-blur-sm">
              Sold
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
            <p className="font-display text-base text-foreground">{artwork.title}</p>
            <span className="shrink-0 rounded-full border border-foreground/20 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-foreground backdrop-blur-sm">
              {priceFormatter.format(Number(artwork.price))}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
