import Link from 'next/link';

import { CoverImage } from '../ui/CoverImage';
import type { ArtworkSummary } from '../../lib/artworksApi';

const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD', // TODO: switch to artwork.currency once multi-currency display is needed
  maximumFractionDigits: 0,
});

export function GalleryArtworkCard({ artwork }: { artwork: ArtworkSummary }) {
  return (
    <Link
      href={`/artwork/${artwork.slug}`}
      className="group relative block aspect-[4/5] overflow-hidden rounded-md focus-visible:outline-2"
      aria-label={`View ${artwork.title} by ${artwork.artist.name}`}
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
        <span className="absolute left-4 top-4 rounded-full bg-background/85 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/80 backdrop-blur-sm">
          Sold
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
        <div>
          <p className="font-display text-lg text-foreground">{artwork.title}</p>
          <p className="mt-1 flex items-center gap-1 text-[13px] text-foreground/70">
            {artwork.artist.name}
            {artwork.artist.verified && (
              <span aria-label="Verified artist" title="Verified artist" className="text-accent">
                ✓
              </span>
            )}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-foreground/20 bg-background/60 px-3 py-1 text-xs font-medium text-foreground backdrop-blur-sm">
          {priceFormatter.format(Number(artwork.price))}
        </span>
      </div>
    </Link>
  );
}
