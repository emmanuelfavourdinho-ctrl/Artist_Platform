import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    artistProfile: { findUnique: vi.fn() },
    artwork: { findMany: vi.fn() },
    review: { aggregate: vi.fn(), findMany: vi.fn() },
  },
}));

import { app } from '../app.js';
import { prisma } from '../lib/prisma.js';

describe('GET /api/v1/artists/:slug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 for an unknown artist slug', async () => {
    vi.mocked(prisma.artistProfile.findUnique).mockResolvedValue(null);

    const response = await request(app).get('/api/v1/artists/does-not-exist');

    expect(response.status).toBe(404);
  });

  it('returns profile, works, and aggregated rating for a real artist', async () => {
    vi.mocked(prisma.artistProfile.findUnique).mockResolvedValue({
      id: 'artist-1',
      displayName: 'Amara N.',
      slug: 'amara-n',
      biography: 'Lagos-based painter.',
      artisticStatement: null,
      location: 'Lagos, Nigeria',
      profileImageUrl: null,
      coverImageUrl: null,
      verificationStatus: 'VERIFIED',
      createdAt: new Date('2025-01-01'),
    } as never);

    vi.mocked(prisma.artwork.findMany).mockResolvedValue([
      {
        id: 'artwork-1',
        slug: 'sunset-over-lagos',
        title: 'Sunset Over Lagos',
        price: '450.00',
        currency: 'USD',
        images: [{ url: 'https://picsum.photos/seed/a/800', altText: 'Sunset' }],
        inventory: { quantity: 1, reservedQuantity: 0, soldQuantity: 0 },
      },
    ] as never);

    vi.mocked(prisma.review.aggregate).mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: 2,
    } as never);

    vi.mocked(prisma.review.findMany).mockResolvedValue([
      {
        id: 'review-1',
        rating: 5,
        title: null,
        comment: 'Beautiful piece.',
        createdAt: new Date('2026-01-01'),
        orderItemId: null,
        user: { firstName: 'Blessing', lastName: 'Okoye' },
        artwork: { title: 'Sunset Over Lagos' },
      },
    ] as never);

    const response = await request(app).get('/api/v1/artists/amara-n');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      name: 'Amara N.',
      verified: true,
      rating: { average: 4.5, count: 2 },
    });
    expect(response.body.data.artworks[0]).toMatchObject({
      slug: 'sunset-over-lagos',
      available: true,
    });
    expect(response.body.data.reviews[0]).toMatchObject({
      reviewerName: 'Blessing O.',
      artworkTitle: 'Sunset Over Lagos',
    });
  });

  it('marks artwork unavailable when fully sold and reflects unverified status', async () => {
    vi.mocked(prisma.artistProfile.findUnique).mockResolvedValue({
      id: 'artist-1',
      displayName: 'Amara N.',
      slug: 'amara-n',
      biography: null,
      artisticStatement: null,
      location: null,
      profileImageUrl: null,
      coverImageUrl: null,
      verificationStatus: 'PENDING',
      createdAt: new Date(),
    } as never);
    vi.mocked(prisma.artwork.findMany).mockResolvedValue([
      {
        id: 'artwork-1',
        slug: 'a',
        title: 'A',
        price: '1',
        currency: 'USD',
        images: [],
        inventory: { quantity: 1, reservedQuantity: 0, soldQuantity: 1 },
      },
    ] as never);
    vi.mocked(prisma.review.aggregate).mockResolvedValue({
      _avg: { rating: null },
      _count: 0,
    } as never);
    vi.mocked(prisma.review.findMany).mockResolvedValue([]);

    const response = await request(app).get('/api/v1/artists/amara-n');

    expect(response.body.data.verified).toBe(false);
    expect(response.body.data.artworks[0].available).toBe(false);
  });
});
