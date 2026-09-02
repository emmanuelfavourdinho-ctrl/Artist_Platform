import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ArtworkGallery } from '../../../components/artwork/ArtworkGallery';
import { ArtworkInfoPanel } from '../../../components/artwork/ArtworkInfoPanel';
import { ReviewForm } from '../../../components/artwork/ReviewForm';
import { ReviewsList } from '../../../components/artwork/ReviewsList';
import { fetchArtworkBySlug } from '../../../lib/artworksApi';
import { fetchArtworkReviews } from '../../../lib/reviewsApi';

interface ArtworkPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ArtworkPageProps): Promise<Metadata> {
  const { slug } = await params;
  const artwork = await fetchArtworkBySlug(slug);

  if (!artwork) return { title: 'Artwork Not Found — FineArts' };

  const artistName = artwork.artist.name;
  const primaryImage = artwork.images.find((img) => img.isPrimary)?.url ?? artwork.images[0]?.url;

  return {
    title: `${artwork.title} by ${artistName} — FineArts`,
    description: artwork.description ?? `${artwork.title}, an original work by ${artistName}.`,
    openGraph: {
      title: artwork.title,
      description: artwork.description ?? `Original artwork by ${artistName}`,
      images: primaryImage ? [{ url: primaryImage, alt: artwork.title }] : [],
    },
  };
}

export default async function ArtworkPage({ params }: ArtworkPageProps) {
  const { slug } = await params;

  const artwork = await fetchArtworkBySlug(slug);
  if (!artwork) notFound();

  const reviewsResult = await fetchArtworkReviews(artwork.id);

  const artistName = artwork.artist.name;
  const primaryImage = artwork.images.find((img) => img.isPrimary)?.url ?? artwork.images[0]?.url;

  // Uses `artwork.available` matching your ArtworkDetail interface
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VisualArtwork',
    name: artwork.title,
    image: primaryImage,
    description: artwork.description,
    creator: {
      '@type': 'Person',
      name: artistName,
    },
    offers: {
      '@type': 'Offer',
      price: artwork.price,
      priceCurrency: artwork.currency,
      availability: artwork.available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16 items-start">
          <div className="lg:col-span-7 sticky top-24">
            <ArtworkGallery images={artwork.images} title={artwork.title} />
          </div>

          <div className="lg:col-span-5">
            <ArtworkInfoPanel artwork={artwork} />
          </div>
        </div>

        <section className="mt-20 border-t border-slate-200 pt-16 dark:border-slate-800">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-7">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Collector Reviews
                </h2>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {reviewsResult?.data?.length ?? 0} Total Reviews
                </span>
              </div>
              <ReviewsList reviews={reviewsResult?.data ?? []} />
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  Share Your Experience
                </h2>
                <p className="text-xs text-slate-500 mb-6">
                  Have you collected or inquired about this piece? Leave feedback for the artist.
                </p>
                <ReviewForm artworkId={artwork.id} />
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
