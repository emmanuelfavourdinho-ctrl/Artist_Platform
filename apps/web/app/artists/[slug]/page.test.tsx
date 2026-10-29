import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ fetchArtistBySlug: vi.fn() }));

vi.mock('@/lib/artistsApi', () => ({ fetchArtistBySlug: api.fetchArtistBySlug }));
vi.mock('@/components/artist/ArtistHeader', () => ({ ArtistHeader: () => null }));
vi.mock('@/components/artist/ArtistWorksGrid', () => ({ ArtistWorksGrid: () => null }));
vi.mock('@/components/artist/ArtistReviewsList', () => ({ ArtistReviewsList: () => null }));

import { generateMetadata } from './page';

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchArtistBySlug.mockResolvedValue({
    id: 'artist-id', name: 'Ari Artist', slug: 'ari-artist', biography: 'A painter working with color and memory.',
    artisticStatement: null, mission: null, location: 'Lagos', website: null,
    profileImageUrl: 'https://res.cloudinary.com/fine-arts/image/upload/ari.jpg',
    coverImageUrl: 'https://res.cloudinary.com/fine-arts/image/upload/cover.jpg',
    verified: true, joinedAt: '2025-01-01', rating: { average: null, count: 0 }, artworks: [], reviews: [],
  });
});

describe('public artist portfolio metadata', () => {
  it('uses the stable artist slug and cover image for sharing', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'ari-artist' }) });
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    expect(metadata.alternates?.canonical).toBe(`${baseUrl.replace(/\/$/, '')}/artists/ari-artist`);
    expect(metadata.openGraph?.images).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: 'https://res.cloudinary.com/fine-arts/image/upload/cover.jpg' }),
    ]));
  });

  it('returns missing-page metadata for a profile that is not public', async () => {
    api.fetchArtistBySlug.mockResolvedValue(null);
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'private-artist' }) });
    expect(metadata.title).toMatch(/not found/i);
    expect(metadata.alternates?.canonical).toBeUndefined();
  });
});
