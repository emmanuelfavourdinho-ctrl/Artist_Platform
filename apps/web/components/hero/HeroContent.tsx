import type { CSSProperties } from 'react';

import { Button } from '../ui/Button';

/*
  Explainer: each line below has a slightly longer `animationDelay` than
  the one above it, so they don't all appear at once — the eyebrow label
  appears first, then the headline, then the description, then the
  buttons. That staggered timing is what makes a page-load feel directed,
  like a title sequence, rather than everything just popping in together.
*/
export function HeroContent() {
  return (
    <div className="relative z-10 mx-auto flex h-full max-w-content flex-col justify-end px-gutter pb-28 pt-40 sm:pb-32">
      <p
        className="animate-reveal-up text-[13px] font-medium uppercase tracking-[0.3em] text-accent"
        style={{ '--reveal-delay': '200ms' } as CSSProperties}
      >
        Artist_Platform
      </p>

      <h1
        className="animate-reveal-up mt-5 max-w-3xl font-display text-[2.75rem] leading-[1.05] text-foreground sm:text-6xl lg:text-7xl"
        style={{ '--reveal-delay': '400ms' } as CSSProperties}
      >
        Where creativity
        <br />
        finds its <span className="italic text-accent">audience.</span>
      </h1>

      <p
        className="animate-reveal-up mt-6 max-w-xl text-base leading-7 text-foreground/75 sm:text-lg"
        style={{ '--reveal-delay': '600ms' } as CSSProperties}
      >
        A creative ecosystem for discovering artists, showcasing work, building connections,
        and turning creativity into opportunity.
      </p>

      <div
        className="animate-reveal-up mt-9 flex flex-col gap-4 sm:flex-row"
        style={{ '--reveal-delay': '750ms' } as CSSProperties}
      >
        <Button href="/" variant="primary">
          Explore Artists
        </Button>
        <Button href="/" variant="secondary">
          Start Creating
        </Button>
      </div>

      <p
        className="animate-reveal-up mt-10 text-xs uppercase tracking-[0.2em] text-foreground/50"
        style={{ '--reveal-delay': '900ms' } as CSSProperties}
      >
        12,400+ artists already showcasing work worldwide
      </p>
    </div>
  );
}
