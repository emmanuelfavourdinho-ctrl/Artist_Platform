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

  if (!artwork) return { title: 'Artwork not found — Artist_Platform' };

  return {
    title: `${artwork.title} by ${artwork.artist.name} — Artist_Platform`,
    description:
      artwork.description ?? `${artwork.title}, original work by ${artwork.artist.name}.`,
    openGraph: {
      title: artwork.title,
      images: artwork.images[0] ? [artwork.images[0].url] : undefined,
    },
  };
}

export default async function ArtworkPage({ params }: ArtworkPageProps) {
  const { slug } = await params;
  const artwork = await fetchArtworkBySlug(slug);

  if (!artwork) notFound();

  const reviewsResult = await fetchArtworkReviews(artwork.id);

  return (
    <main className="mx-auto max-w-content px-gutter py-16 sm:py-24">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <ArtworkGallery images={artwork.images} title={artwork.title} />
        <ArtworkInfoPanel artwork={artwork} />
      </div>

      <section className="mt-20 grid gap-12 border-t border-foreground/10 pt-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="font-display text-2xl text-foreground">Reviews</h2>
          <div className="mt-6">
            <ReviewsList reviews={reviewsResult.data} />
          </div>
        </div>

        <div>
          <h2 className="font-display text-2xl text-foreground">Write a review</h2>
          <div className="mt-6">
            <ReviewForm artworkId={artwork.id} />
          </div>
        </div>
      </section>
    </main>
  );
}
