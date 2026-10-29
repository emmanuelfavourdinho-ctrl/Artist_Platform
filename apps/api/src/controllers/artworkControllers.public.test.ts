import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const artworkFindFirst = vi.hoisted(() => vi.fn());
vi.mock('../lib/prisma.js', () => ({ prisma: { artwork: { findFirst: artworkFindFirst } } }));

import { getArtworkBySlug } from './artworkControllers.js';

describe('public artwork slug access', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 404 for unpublished or private artwork and scopes the query to public published state', async () => {
    artworkFindFirst.mockResolvedValue(null);
    const res = { json: vi.fn() } as unknown as Response;
    await expect(getArtworkBySlug({ params: { slug: 'private-piece' } } as unknown as Request, res))
      .rejects.toMatchObject({ status: 404, code: 'ARTWORK_NOT_FOUND' });
    expect(artworkFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { slug: 'private-piece', status: 'PUBLISHED', visibility: 'PUBLIC' },
    }));
  });
});
