import { HeroBackground } from './HeroBackground';
import { HeroContent } from './HeroContent';
import { ScrollIndicator } from './ScrollIndicator';

export function Hero() {
  return (
    <section
      aria-label="Introduction"
      className="relative flex min-h-[100svh] w-full flex-col overflow-hidden"
    >
      <HeroBackground />
      <HeroContent />
      <ScrollIndicator />
    </section>
  );
}
