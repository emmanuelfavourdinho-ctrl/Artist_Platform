import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArtistHeader } from '../../../components/artist/ArtistHeader';
import { ArtistWorksGrid } from '../../../components/artist/ArtistWorksGrid';
import { ArtistReviewsList } from '../../../components/artist/ArtistReviewsList';
import { fetchArtistBySlug } from '../../../lib/artistsApi';
import { publicUrl } from '../../../lib/siteUrl';

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
    alternates: { canonical: publicUrl(`/artists/${artist.slug}`) },
    openGraph: {
      type: 'website',
      url: publicUrl(`/artists/${artist.slug}`),
      title: `${artist.name} — Fine Arts`,
      description: artist.biography ?? `Explore original work by ${artist.name}.`,
      images: artist.coverImageUrl
        ? [{ url: artist.coverImageUrl, alt: `${artist.name}'s portfolio` }]
        : artist.profileImageUrl ? [{ url: artist.profileImageUrl, alt: artist.name }] : [],
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function ArtistPage({ params }: ArtistPageProps) {
  const { slug } = await params;
  const artist = await fetchArtistBySlug(slug);

  if (!artist) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-8 sm:py-10 lg:px-10">
      <nav aria-label="Public site" className="mb-8 flex items-center justify-between border-b border-foreground/10 pb-4">
        <Link href="/" className="font-display text-lg text-foreground">Fine Arts</Link>
        <Link href="/gallery" className="text-sm text-muted hover:text-accent">Explore artwork</Link>
      </nav>
      <ArtistHeader artist={artist} />
      <p className="mt-4 text-right text-xs">
        <Link
          className="text-muted underline underline-offset-4 hover:text-accent"
          href={`/report-issue?targetType=USER&targetSlug=${encodeURIComponent(artist.slug)}&targetName=${encodeURIComponent(artist.name)}`}
        >
          Report this artist
        </Link>
      </p>

      <section className="mt-12 border-t border-foreground/10 pt-10 sm:mt-16 sm:pt-12">
        <h2 className="font-display text-2xl text-foreground">Available work by {artist.name}</h2>
        <p className="mt-2 text-sm text-muted">Browse published pieces and open a listing for full details.</p>
        <ArtistWorksGrid artworks={artist.artworks} artistName={artist.name} />
      </section>

      <section className="mt-16 border-t border-foreground/10 pt-12">
        <h2 className="font-display text-2xl text-foreground">Reviews</h2>
        <ArtistReviewsList reviews={artist.reviews} />
      </section>
    </main>
  );
}
