import type { Metadata } from 'next';

import { GalleryEmptyState } from '../../components/gallery/GalleryEmptyState';
import { GalleryFilters } from '../../components/gallery/GalleryFilters';
import { GalleryGrid } from '../../components/gallery/GalleryGrid';
import { GalleryPagination } from '../../components/gallery/GalleryPagination';
import { fetchArtworks, ListArtworksQuery, ListArtworksResponse } from '../../lib/artworksApi';

export const metadata: Metadata = {
  title: 'The Collection — FineArts',
  description:
    'Discover curated original paintings, sculptures, and digital art from verified independent artists worldwide.',
  openGraph: {
    title: 'The Collection — FineArts',
    description: 'Browse original fine art available directly from independent creators.',
    type: 'website',
  },
};

interface GalleryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  const rawParams = await searchParams;

  const query: ListArtworksQuery = {
    page: firstValue(rawParams.page) ?? '1',
    sort: (firstValue(rawParams.sort) as ListArtworksQuery['sort']) ?? 'featured',
    minPrice: firstValue(rawParams.minPrice),
    maxPrice: firstValue(rawParams.maxPrice),
    category: firstValue(rawParams.category),
    medium: firstValue(rawParams.medium),
    style: firstValue(rawParams.style),
    theme: firstValue(rawParams.theme),
    artist: firstValue(rawParams.artist),
  };

  let result: ListArtworksResponse = {
    status: 'success',
    data: [],
    pagination: {
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 1,
    },
  };

  try {
    const apiResult = await fetchArtworks(query);
    if (apiResult?.data) {
      result = apiResult;
    }
  } catch (error) {
    console.error('[GalleryPage Error]: Failed to load artworks catalog', error);
  }

  function buildPageHref(page: number): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    }
    params.set('page', String(page));
    return `/gallery?${params.toString()}`;
  }

  const hasArtworks = Array.isArray(result.data) && result.data.length > 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
          The <span className="italic text-amber-600">Collection.</span>
        </h1>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-400">
          Original work from independent artists, available to bring home.
        </p>
      </header>

      <div className="mt-8 border-y border-slate-200 py-4 dark:border-slate-800">
        <GalleryFilters searchParams={query as Record<string, string | undefined>} />
      </div>

      <section className="mt-8">
        {!hasArtworks ? (
          <GalleryEmptyState />
        ) : (
          <div className="space-y-12">
            <GalleryGrid artworks={result.data} />

            <div className="flex justify-center border-t border-slate-100 pt-8 dark:border-slate-900">
              <GalleryPagination pagination={result.pagination} buildHref={buildPageHref} />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
