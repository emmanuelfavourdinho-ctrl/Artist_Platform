import { Reveal } from '../../components/ui/Reveal';

export const metadata = {
  title: 'About | FineArts',
  description: 'Learn about our mission to empower creators and collectors globally.',
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-content px-gutter py-20 md:py-32">
      <Reveal>
        <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">Our Vision</p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Empowering the next generation of <span className="italic text-accent">creators.</span>
        </h1>
      </Reveal>

      <section className="mt-16 grid grid-cols-1 gap-12 md:grid-cols-2">
        <Reveal delay={100}>
          <div className="space-y-6 text-foreground/80 leading-relaxed">
            <p>
              FineArts was built to bridge the gap between world-class creators and serious
              collectors. We believe digital and traditional artistry deserve a home designed with
              restraint, clarity, and precision.
            </p>
            <p>
              Our platform offers artists full control over their presence, enabling seamless
              commerce, interactive community engagement, and curated exhibition space.
            </p>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className="border-l border-foreground/10 pl-8 space-y-8">
            <div>
              <h3 className="font-display text-xl text-foreground">Curated Marketplace</h3>
              <p className="mt-2 text-sm text-muted">
                Direct line between verified artists and dedicated global buyers.
              </p>
            </div>
            <div>
              <h3 className="font-display text-xl text-foreground">Complete Ownership</h3>
              <p className="mt-2 text-sm text-muted">
                Transparent transaction flows built with creator-first economics.
              </p>
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
