import Link from 'next/link';

import { CoverImage } from '../ui/CoverImage';
import type { Artist } from '../../data/types';

type ArtistCardProps = {
  artist: Artist;
  /** Taller portraits break the grid rhythm slightly, like a real editorial layout. */
  tall?: boolean;
};

export function ArtistCard({ artist, tall = false }: ArtistCardProps) {
  return (
    <Link
      href="/"
      className="group block focus-visible:outline-2"
      aria-label={`View ${artist.name}'s profile`}
    >
      <div
        className={`relative overflow-hidden rounded-md ${tall ? 'aspect-[3/4]' : 'aspect-square'}`}
      >
        <div className="h-full w-full transition-transform duration-700 ease-cinematic group-hover:scale-105">
          <CoverImage
            src={artist.image}
            alt={artist.imageAlt}
            sizes="(min-width: 1024px) 33vw, 50vw"
            className="h-full w-full"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/10 to-transparent" />
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg text-foreground">{artist.name}</p>
          <p className="mt-1 text-[13px] uppercase tracking-[0.1em] text-muted">
            {artist.discipline} — {artist.location}
          </p>
        </div>
        <span
          aria-hidden="true"
          className="mt-1 shrink-0 text-foreground/40 transition-all duration-300 ease-cinematic group-hover:translate-x-0.5 group-hover:text-accent"
        >
          →
        </span>
      </div>
    </Link>
  );
}
