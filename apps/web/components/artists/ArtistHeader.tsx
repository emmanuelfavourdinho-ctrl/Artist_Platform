import type { ArtistProfileData } from '../../lib/artistsApi';
import { CoverImage } from '../ui/CoverImage';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

export function ArtistHeader({ artist }: { artist: ArtistProfileData }) {
  return (
    <div className="relative">
      <div className="aspect-[3/1] w-full overflow-hidden rounded-md bg-surface">
        {artist.coverImageUrl ? (
          <CoverImage src={artist.coverImageUrl} alt="" sizes="100vw" className="h-full w-full" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-surface to-surface-raised" />
        )}
      </div>

      <div className="relative -mt-16 flex flex-col items-start gap-5 px-2 sm:flex-row sm:items-end">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-full border-4 border-background bg-surface">
          {artist.profileImageUrl ? (
            <CoverImage
              src={artist.profileImageUrl}
              alt={artist.name}
              sizes="112px"
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-3xl text-muted">
              {artist.name.charAt(0)}
            </div>
          )}
        </div>

        <div className="pb-2">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl text-foreground sm:text-4xl">{artist.name}</h1>
            {artist.verified && (
              <span aria-label="Verified artist" title="Verified artist" className="text-accent">
                ✓
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {artist.location && <>{artist.location} · </>}
            Joined {dateFormatter.format(new Date(artist.joinedAt))}
          </p>
        </div>
      </div>

      {(artist.biography || artist.artisticStatement) && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {artist.biography && (
            <div>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
                Biography
              </h2>
              <p className="mt-2 text-sm leading-7 text-foreground/80">{artist.biography}</p>
            </div>
          )}
          {artist.artisticStatement && (
            <div>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
                Artist statement
              </h2>
              <p className="mt-2 text-sm leading-7 text-foreground/80">
                {artist.artisticStatement}
              </p>
            </div>
          )}
        </div>
      )}

      {artist.rating.count > 0 && (
        <div className="mt-6 flex items-center gap-2 text-sm text-foreground/80">
          <span className="text-accent">★</span>
          <span className="font-medium text-foreground">{artist.rating.average?.toFixed(1)}</span>
          <span className="text-muted">
            ({artist.rating.count} review{artist.rating.count === 1 ? '' : 's'})
          </span>
        </div>
      )}
    </div>
  );
}
