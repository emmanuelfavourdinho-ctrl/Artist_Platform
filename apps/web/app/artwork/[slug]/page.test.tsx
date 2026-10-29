import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtworkDetail } from '../../../types/artwork';

const api = vi.hoisted(() => ({ fetchArtworkBySlug: vi.fn() }));

vi.mock('@/lib/artworksApi', () => ({ fetchArtworkBySlug: api.fetchArtworkBySlug }));
vi.mock('@/lib/reviewsApi', () => ({ fetchArtworkReviews: vi.fn() }));
vi.mock('@/components/artwork/ArtworkGallery', () => ({ ArtworkGallery: () => null }));
vi.mock('@/components/artwork/ArtworkInfoPanel', () => ({ ArtworkInfoPanel: () => null }));
vi.mock('@/components/artwork/ReviewForm', () => ({ ReviewForm: () => null }));
vi.mock('@/components/artwork/ReviewsList', () => ({ ReviewsList: () => null }));

import { generateMetadata } from './page';

const detail = {
  id: 'artwork-id', slug: 'quiet-tide', title: 'Quiet Tide', description: 'Blue and gold at dusk.',
  price: '120.00', currency: 'USD', yearCreated: 2025,
  dimensions: { width: null, height: null, depth: null, weight: null }, materials: 'Oil', publishedAt: '2026-01-01',
  images: [{ id: 'image', url: 'https://res.cloudinary.com/fine-arts/image/upload/tide.jpg', altText: 'Blue tide', width: 1200, height: 1500, isPrimary: true }],
  categories: [], styles: [], themes: [], mediums: [], available: true,
  artist: { id: 'artist-id', name: 'Ari Artist', slug: 'ari-artist', verified: true, biography: null, profileImageUrl: null },
} as ArtworkDetail;

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchArtworkBySlug.mockResolvedValue(detail);
});

describe('public artwork metadata', () => {
  it('uses a canonical slug URL and the artwork cover for social previews', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'quiet-tide' }) });
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    expect(metadata.alternates?.canonical).toBe(`${baseUrl.replace(/\/$/, '')}/artwork/quiet-tide`);
    expect(metadata.openGraph?.title).toContain('Quiet Tide');
    expect(metadata.openGraph?.images).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: detail.images[0]!.url, alt: 'Quiet Tide' }),
    ]));
  });

  it('does not produce social metadata for an unpublished or missing artwork', async () => {
    api.fetchArtworkBySlug.mockResolvedValue(null);
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'draft-piece' }) });
    expect(metadata.title).toMatch(/not found/i);
    expect(metadata.alternates?.canonical).toBeUndefined();
  });
});
