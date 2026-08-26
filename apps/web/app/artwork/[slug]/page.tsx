import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ArtworkGallery } from '../../../components/artworks/ArtworkGallery';
import { ArtworkInfoPanel } from '../../../components/artworks/ArtworkInfoPanel';
import { fetchArtworkBySlug } from '../../../lib/artworksApi';

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

  return (
    <main className="mx-auto max-w-content px-gutter py-16 sm:py-24">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <ArtworkGallery images={artwork.images} title={artwork.title} />
        <ArtworkInfoPanel artwork={artwork} />
      </div>
    </main>
  );
}
