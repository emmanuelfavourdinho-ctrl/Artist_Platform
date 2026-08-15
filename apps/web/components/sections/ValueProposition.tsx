import { Reveal } from '../ui/Reveal';

const PILLARS = [
  {
    title: 'Discover',
    copy: 'Find artists and creative work across every discipline, curated by craft rather than clicks.',
  },
  {
    title: 'Create',
    copy: 'Build a professional creative presence with a portfolio that does your work justice.',
  },
  {
    title: 'Connect',
    copy: 'Build meaningful creative relationships with collectors, studios, and fellow artists.',
  },
  {
    title: 'Earn',
    copy: 'Turn creative work into opportunity, from commissions to gallery representation.',
  },
];

export function ValueProposition() {
  return (
    <section aria-labelledby="value-heading" className="bg-surface py-24 sm:py-32">
      <div className="mx-auto max-w-content px-gutter">
        <Reveal>
          <h2 id="value-heading" className="sr-only">
            Why artists choose Artist_Platform
          </h2>
          <p className="max-w-2xl text-sm uppercase tracking-[0.2em] text-accent">
            Built for the whole creative journey
          </p>
        </Reveal>

        <div className="mt-10 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((pillar, index) => (
            <Reveal key={pillar.title} delay={index * 90}>
              <div className="border-t border-foreground/15 pt-6">
                <h3 className="font-display text-2xl text-foreground">{pillar.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted">{pillar.copy}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
