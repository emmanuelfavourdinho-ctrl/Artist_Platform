import { Button } from '../ui/Button';
import { CoverImage } from '../ui/CoverImage';
import { Reveal } from '../ui/Reveal';

/*
  Explainer: rather than asking for a brand-new, one-off photo just for
  this section, we reuse one of the four hero images here (dimmed further
  behind an extra overlay). That keeps the number of photos you need to
  gather down to a manageable set, while still giving this closing
  section its own moody backdrop instead of a flat color.
*/
export function FinalCTA() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="relative overflow-hidden bg-background py-32 sm:py-40"
    >
      <div className="absolute inset-0 opacity-40">
        <CoverImage src="/images/hero/hero-03.jpg" alt="" sizes="100vw" className="h-full w-full" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/60" />

      <div className="relative mx-auto max-w-content px-gutter text-center">
        <Reveal>
          <h2
            id="final-cta-heading"
            className="mx-auto max-w-2xl font-display text-4xl leading-[1.1] text-foreground sm:text-6xl"
          >
            Your work deserves
            <br />
            to be <span className="italic text-accent">discovered.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-base leading-7 text-foreground/70">
            Build your presence. Share your work. Find your audience.
          </p>
          <div className="mt-9 flex justify-center">
            <Button href="/register" variant="primary">
              Join Artist_Platform
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
