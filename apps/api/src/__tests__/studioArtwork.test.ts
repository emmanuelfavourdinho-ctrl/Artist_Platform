import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const tx = {
    artwork: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    artworkImage: { deleteMany: vi.fn(), createMany: vi.fn() },
    artworkModeration: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      artistProfile: { findUnique: vi.fn(), create: vi.fn() },
      artwork: { create: vi.fn(), findFirst: vi.fn() },
      $transaction: vi.fn(),
    },
    recordAudit: vi.fn(),
  };
});

vi.mock('../config/db.js', () => ({ prisma: mocks.prisma }));
vi.mock('../config/index.js', () => ({ config: { cloudinary: { cloudName: 'fine-arts-test', apiSecret: 'test-secret' } } }));
vi.mock('../services/auditService.js', () => ({ recordAudit: mocks.recordAudit }));

import {
  archiveStudioArtwork,
  createStudioArtwork,
  publishStudioArtwork,
  submitStudioArtwork,
  updateStudioArtwork,
} from '../controllers/studioController.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ARTIST_ID = '22222222-2222-4222-8222-222222222222';
const ARTWORK_ID = '33333333-3333-4333-8333-333333333333';

function request(body: unknown = {}, params: Record<string, string> = {}) {
  return { user: { id: USER_ID }, body, params } as unknown as Request;
}

const image = {
  publicId: `artists/${USER_ID}/artworks/image-1`,
  secureUrl: `https://res.cloudinary.com/fine-arts-test/image/upload/v1/artists/${USER_ID}/artworks/image-1.jpg`,
  resourceType: 'image',
  format: 'jpg',
  width: 1200,
  height: 800,
  bytes: 1000,
  version: 1,
  signature: createHash('sha1').update(`public_id=artists/${USER_ID}/artworks/image-1&version=1test-secret`).digest('hex'),
};

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx as never));
  mocks.recordAudit.mockResolvedValue({});
});

describe('artist artwork workflow', () => {
  it('creates artwork using the signed-in artist and initializes inventory', async () => {
    mocks.prisma.artistProfile.findUnique.mockResolvedValue({ id: ARTIST_ID } as never);
    mocks.prisma.artwork.create.mockResolvedValue({ id: ARTWORK_ID } as never);
    const res = response();

    await createStudioArtwork(request({
      title: 'Quiet Horizon',
      description: 'A study in light',
      price: '125.00',
      currency: 'USD',
      images: [image],
    }), res, vi.fn());

    expect(mocks.prisma.artwork.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        artistId: ARTIST_ID,
        currency: 'USD',
        inventory: { create: {} },
      }),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('does not permit edits to artwork not owned by the current artist', async () => {
    mocks.prisma.artistProfile.findUnique.mockResolvedValue({ id: ARTIST_ID } as never);
    mocks.prisma.artwork.findFirst.mockResolvedValue(null as never);

    await updateStudioArtwork(request({ images: [image] }, { id: ARTWORK_ID }), response(), vi.fn());

    expect(mocks.prisma.artwork.findFirst).toHaveBeenCalledWith({
      where: { id: ARTWORK_ID, artistId: ARTIST_ID },
      select: { id: true, currency: true, status: true },
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('submits owned draft artwork for moderation and records the state change', async () => {
    mocks.prisma.artistProfile.findUnique.mockResolvedValue({ id: ARTIST_ID } as never);
    mocks.tx.artwork.findFirst.mockResolvedValue({
      id: ARTWORK_ID,
      status: 'DRAFT',
      title: 'Quiet Horizon',
      price: { lte: () => false },
      currency: 'USD',
      images: [{ id: 'image-1' }],
    } as never);
    mocks.tx.artwork.updateMany.mockResolvedValue({ count: 1 } as never);
    mocks.tx.artworkModeration.create.mockResolvedValue({} as never);
    const res = response();

    await submitStudioArtwork(request({}, { id: ARTWORK_ID }), res, vi.fn());

    expect(mocks.tx.artwork.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ARTWORK_ID, artistId: ARTIST_ID, status: 'DRAFT' },
      data: { status: 'PENDING_REVIEW', visibility: 'PRIVATE' },
    }));
    expect(mocks.tx.artworkModeration.create).toHaveBeenCalledWith({
      data: { artworkId: ARTWORK_ID, action: 'SUBMITTED' },
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({
      action: 'ARTWORK_SUBMITTED',
      entityId: ARTWORK_ID,
    }));
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: ARTWORK_ID, status: 'PENDING_REVIEW' } });
  });

  it('only publishes approved USD artwork for its owner', async () => {
    mocks.prisma.artistProfile.findUnique.mockResolvedValue({ id: ARTIST_ID } as never);
    mocks.tx.artwork.updateMany.mockResolvedValue({ count: 1 } as never);
    mocks.tx.artwork.findUniqueOrThrow.mockResolvedValue({
      id: ARTWORK_ID, status: 'PUBLISHED', visibility: 'PUBLIC', publishedAt: new Date(),
    } as never);
    const res = response();

    await publishStudioArtwork(request({}, { id: ARTWORK_ID }), res, vi.fn());

    expect(mocks.tx.artwork.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ARTWORK_ID, artistId: ARTIST_ID, status: 'APPROVED', currency: { equals: 'USD', mode: 'insensitive' } },
      data: expect.objectContaining({ status: 'PUBLISHED', visibility: 'PUBLIC' }),
    }));
    expect(res.json).toHaveBeenCalledOnce();
  });

  it('cannot archive sold artwork', async () => {
    mocks.prisma.artistProfile.findUnique.mockResolvedValue({ id: ARTIST_ID } as never);
    mocks.tx.artwork.findFirst.mockResolvedValue({ id: ARTWORK_ID, status: 'SOLD' } as never);
    const next = vi.fn();

    await archiveStudioArtwork(request({}, { id: ARTWORK_ID }), response(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      status: 409,
      code: 'INVALID_ARTWORK_TRANSITION',
    }));
    expect(mocks.tx.artwork.updateMany).not.toHaveBeenCalled();
  });
});
