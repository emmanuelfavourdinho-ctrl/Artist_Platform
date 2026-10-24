import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArtistHeader } from '../../../components/artist/ArtistHeader';
import { ArtistWorksGrid } from '../../../components/artist/ArtistWorksGrid';
import { ArtistReviewsList } from '../../../components/artist/ArtistReviewsList';
import { fetchArtistBySlug } from '../../../lib/artistsApi';

interface ArtistPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ArtistPageProps): Promise<Metadata> {
  const { slug } = await params;
  const artist = await fetchArtistBySlug(slug);

  if (!artist) return { title: 'Artist not found — Artist_Platform' };

  return {
    title: `${artist.name} — Artist_Platform`,
    description: artist.biography ?? `Original work by ${artist.name}.`,
  };
}

export default async function ArtistPage({ params }: ArtistPageProps) {
  const { slug } = await params;
  const artist = await fetchArtistBySlug(slug);

  if (!artist) notFound();

  return (
    <main className="mx-auto max-w-content px-gutter py-16 sm:py-24">
      <ArtistHeader artist={artist} />
      <p className="mt-4 text-right text-xs">
        <Link
          className="text-muted underline underline-offset-4 hover:text-accent"
          href={`/report-issue?targetType=USER&targetSlug=${encodeURIComponent(artist.slug)}&targetName=${encodeURIComponent(artist.name)}`}
        >
          Report this artist
        </Link>
      </p>

      <section className="mt-16">
        <h2 className="font-display text-2xl text-foreground">Works by {artist.name}</h2>
        <ArtistWorksGrid artworks={artist.artworks} artistName={artist.name} />
      </section>

      <section className="mt-16 border-t border-foreground/10 pt-12">
        <h2 className="font-display text-2xl text-foreground">Reviews</h2>
        <ArtistReviewsList reviews={artist.reviews} />
      </section>
    </main>
  );
}
