import type { Metadata } from 'next';

import { GalleryEmptyState } from '../../components/gallery/GalleryEmptyState';
import { GalleryFilters } from '../../components/gallery/GalleryFilters';
import { GalleryGrid } from '../../components/gallery/GalleryGrid';
import { GalleryPagination } from '../../components/gallery/GalleryPagination';
import { fetchArtworks } from '../../lib/artworksApi';

export const metadata: Metadata = {
  title: 'Gallery — Artist_Platform',
  description: 'Discover original artwork from independent artists.',
};

interface GalleryPageProps {
  // Next.js 15: searchParams is a Promise. If this project is on Next 14,
  // drop the Promise wrapper and the `await` below.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  const rawParams = await searchParams;

  const query = {
    page: firstValue(rawParams.page),
    sort: firstValue(rawParams.sort),
    minPrice: firstValue(rawParams.minPrice),
    maxPrice: firstValue(rawParams.maxPrice),
    category: firstValue(rawParams.category),
    medium: firstValue(rawParams.medium),
    style: firstValue(rawParams.style),
    theme: firstValue(rawParams.theme),
    artist: firstValue(rawParams.artist),
  };

  const result = await fetchArtworks(query);

  function buildPageHref(page: number): string {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) next.set(key, value);
    }
    next.set('page', String(page));
    return `/gallery?${next.toString()}`;
  }

  return (
    <main className="mx-auto max-w-content px-gutter py-16 sm:py-24">
      <header className="max-w-2xl">
        <h1 className="font-display text-4xl leading-[1.1] text-foreground sm:text-5xl">
          The <span className="italic text-accent">Collection.</span>
        </h1>
        <p className="mt-4 text-base leading-7 text-foreground/70">
          Original work from independent artists, available to bring home.
        </p>
      </header>

      <GalleryFilters searchParams={query as Record<string, string | undefined>} />

      {result.data.length === 0 ? (
        <GalleryEmptyState />
      ) : (
        <>
          <GalleryGrid artworks={result.data} />
          <GalleryPagination pagination={result.pagination} buildHref={buildPageHref} />
        </>
      )}
    </main>
  );
}
