import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  artistFindUnique: vi.fn(),
  artworkFindMany: vi.fn(),
  reviewAggregate: vi.fn(),
  reviewFindMany: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    artistProfile: { findUnique: mocks.artistFindUnique },
    artwork: { findMany: mocks.artworkFindMany },
    review: { aggregate: mocks.reviewAggregate, findMany: mocks.reviewFindMany },
  },
}));

import { getArtistBySlug } from './artistControllers.js';

function response() {
  const mock = { json: vi.fn() };
  return { mock, res: mock as unknown as Response };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.artistFindUnique.mockResolvedValue({
    id: 'artist-id', displayName: 'Ari Artist', slug: 'ari-artist', biography: 'A public biography.',
    artisticStatement: 'An artist statement.', mission: null, website: null, location: 'Lagos',
    profileImageUrl: null, coverImageUrl: null, verificationStatus: 'VERIFIED', createdAt: new Date('2025-01-01'),
  });
  mocks.artworkFindMany.mockResolvedValue([{
    id: 'artwork-id', slug: 'quiet-tide', title: 'Quiet Tide', description: 'Blue at dusk.', price: '120.00', currency: 'USD',
    images: [{ url: 'https://res.cloudinary.com/fine-arts/image/upload/tide.jpg', altText: 'Blue tide' }],
    inventory: { quantity: 1, reservedQuantity: 0, soldQuantity: 0 },
  }]);
  mocks.reviewAggregate.mockResolvedValue({ _avg: { rating: null }, _count: 0 });
  mocks.reviewFindMany.mockResolvedValue([]);
});

describe('public artist portfolio response', () => {
  it('queries only published public artwork and returns intentionally public profile and listing fields', async () => {
    const res = response();
    await getArtistBySlug({ params: { slug: 'ari-artist' } } as unknown as Request, res.res);

    expect(mocks.artworkFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { artistId: 'artist-id', status: 'PUBLISHED', visibility: 'PUBLIC' },
      select: expect.objectContaining({ description: true }),
    }));
    expect(res.mock.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'Ari Artist', biography: 'A public biography.',
        artworks: [expect.objectContaining({ slug: 'quiet-tide', description: 'Blue at dusk.' })],
      }),
    }));
    const body = res.mock.json.mock.calls[0]?.[0];
    expect(body.data).not.toHaveProperty('userId');
    expect(body.data).not.toHaveProperty('email');
  });
});
