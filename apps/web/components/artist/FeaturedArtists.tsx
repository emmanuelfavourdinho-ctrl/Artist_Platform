import { artists } from '../../data/artists';
import { Reveal } from '../ui/Reveal';
import { ArtistCard } from './ArtistCard';

export function FeaturedArtists() {
  return (
    <section aria-labelledby="featured-artists-heading" className="bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-content px-gutter">
        <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <h2
            id="featured-artists-heading"
            className="max-w-xl font-display text-4xl leading-[1.1] text-foreground sm:text-5xl"
          >
            Meet the creators
            <br />
            shaping what comes <span className="italic text-accent">next.</span>
          </h2>
          <p className="max-w-sm text-sm leading-6 text-muted">
            A rotating selection of artists building a following, a body of work, and a
            livelihood — all in one place.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-3">
          {artists.map((artist, index) => (
            <Reveal key={artist.id} delay={index * 80}>
              <ArtistCard artist={artist} tall={index % 3 === 1} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
