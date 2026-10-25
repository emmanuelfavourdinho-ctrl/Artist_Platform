import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { artwork: { findMany: vi.fn(), count: vi.fn() } },
}));

import { prisma } from '../lib/prisma.js';
import { listArtworks } from '../controllers/artworkControllers.js';

describe('public listing currency safety', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters unreconciled non-USD listing prices before gallery sorting and pagination', async () => {
    vi.mocked(prisma.artwork.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.artwork.count).mockResolvedValue(0 as never);
    const response = { json: vi.fn() };

    await listArtworks(
      { query: { page: 1, pageSize: 12, sort: 'price_asc' } } as never,
      response as never,
    );

    expect(vi.mocked(prisma.artwork.findMany).mock.calls[0]?.[0]).toMatchObject({
      where: {
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      currency: 'USD',
      },
    });
    expect(vi.mocked(prisma.artwork.count).mock.calls[0]?.[0]).toMatchObject({
      where: { currency: 'USD' },
    });
  });
});
