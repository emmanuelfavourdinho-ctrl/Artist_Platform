import Link from 'next/link';

import { CoverImage } from '../ui/CoverImage';
import type { Artwork } from '../../data/types';

const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/*
  Note: this card's data comes from the static data/artworks.ts mock
  file, not the real API — so there's no real slug to link to an
  individual /artwork/[slug] page yet. Pointing at /gallery for now
  (the real, working collection) rather than a dead '/' link. If this
  section switches to real fetched data later, this becomes
  `/artwork/${artwork.slug}` — same pattern as GalleryArtworkCard.
*/
export function ArtworkCard({ artwork }: { artwork: Artwork }) {
  return (
    <Link
      href="/gallery"
      className={`group relative block overflow-hidden rounded-md focus-visible:outline-2 ${
        artwork.size === 'lg' ? 'aspect-[4/5]' : 'aspect-[4/3]'
      }`}
      aria-label={`View ${artwork.title} by ${artwork.artist}`}
    >
      <div className="h-full w-full transition-transform duration-700 ease-cinematic group-hover:scale-105">
        <CoverImage
          src={artwork.image}
          alt={artwork.imageAlt}
          sizes={
            artwork.size === 'lg'
              ? '(min-width: 1024px) 66vw, 100vw'
              : '(min-width: 1024px) 33vw, 50vw'
          }
          className="h-full w-full"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/10 to-transparent opacity-90 transition-opacity duration-500 group-hover:opacity-100" />

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
        <div>
          <p className="font-display text-lg text-foreground">{artwork.title}</p>
          <p className="mt-1 text-[13px] text-foreground/70">
            {artwork.artist} · {artwork.category}
          </p>
        </div>
        {artwork.price && (
          <span className="shrink-0 rounded-full border border-foreground/20 bg-background/60 px-3 py-1 text-xs font-medium text-foreground backdrop-blur-sm">
            {priceFormatter.format(artwork.price)}
          </span>
        )}
      </div>
    </Link>
  );
}
