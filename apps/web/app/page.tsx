import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { Hero } from '../components/hero/Hero';
import { FeaturedArtists } from '../components/artists/FeaturedArtists';
import { FeaturedArtworks } from '../components/artworks/FeaturedArtworks';
import { CreativeCategories } from '../components/categories/CreativeCategories';
import { ValueProposition } from '../components/sections/ValueProposition';
import { FinalCTA } from '../components/sections/FinalCTA';

/*
  Explainer: this file is intentionally just a "table of contents" for the
  homepage — it imports each section and lists them in order. All the
  actual design work lives inside each component. Keeping this file thin
  makes it easy to reorder, remove, or test sections later without
  touching their internals.
*/
export default function HomePage() {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-accent focus:px-5 focus:py-3 focus:text-sm focus:font-medium focus:text-accent-foreground"
      >
        Skip to main content
      </a>

      <Navbar />

      <main id="main-content" className="bg-background">
        <Hero />
        <FeaturedArtists />
        <FeaturedArtworks />
        <CreativeCategories />
        <ValueProposition />
        <FinalCTA />
      </main>

      <Footer />
    </>
  );
}
