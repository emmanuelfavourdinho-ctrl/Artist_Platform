import { artworks } from '../../data/artworks';
import { Reveal } from '../ui/Reveal';
import { Button } from '../ui/Button';
import { ArtworkCard } from './ArtworkCard';

/*
  Explainer on the grid: instead of six identical squares in a row (which
  reads as a generic dashboard), we lay artworks into a 6-column grid and
  let two of them span more columns and rows than the rest. That's what
  creates the "large piece next to two small pieces" editorial rhythm the
  brief asked for, similar to how a magazine spread mixes photo sizes.
*/
export function FeaturedArtworks() {
  return (
    <section aria-labelledby="featured-artworks-heading" className="bg-surface py-24 sm:py-32">
      <div className="mx-auto max-w-content px-gutter">
        <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <h2
            id="featured-artworks-heading"
            className="max-w-xl font-display text-4xl leading-[1.1] text-foreground sm:text-5xl"
          >
            Work worth <span className="italic text-accent">discovering.</span>
          </h2>
          <Button href="/" variant="secondary">
            View marketplace
          </Button>
        </Reveal>

        <div className="mt-14 grid grid-cols-2 gap-5 sm:grid-cols-6">
          {artworks.map((artwork, index) => (
            <Reveal
              key={artwork.id}
              delay={index * 70}
              className={
                artwork.size === 'lg' ? 'col-span-2 sm:col-span-4' : 'col-span-1 sm:col-span-2'
              }
            >
              <ArtworkCard artwork={artwork} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
