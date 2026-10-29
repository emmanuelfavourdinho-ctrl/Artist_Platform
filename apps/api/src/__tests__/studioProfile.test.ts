import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({
  profile: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../config/db.js', () => ({ prisma: { artistProfile: mocks.profile } }));
vi.mock('../config/index.js', () => ({
  config: { cloudinary: { cloudName: 'fine-arts', apiKey: 'public-key', apiSecret: 'server-secret' } },
}));

import { getCloudinaryUploadSignature, getStudioArtistProfile, updateArtistProfile } from '../controllers/studioController.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const response = () => {
  const mock = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  return { mock, asResponse: mock as unknown as Response };
};
const image = (folder: 'profile' | 'cover' = 'profile') => ({
  publicId: `artists/${USER_ID}/${folder}/portrait`,
  secureUrl: `https://res.cloudinary.com/fine-arts/image/upload/v1/artists/${USER_ID}/${folder}/portrait.jpg`,
  resourceType: 'image',
  format: 'jpg',
  width: 640,
  height: 640,
  bytes: 100_000,
  version: 1,
  signature: createHash('sha1').update(`public_id=artists/${USER_ID}/${folder}/portrait&version=1server-secret`).digest('hex'),
});

beforeEach(() => vi.resetAllMocks());

describe('Studio artist profile', () => {
  it('reads the profile selected only by the authenticated user id', async () => {
    mocks.profile.findUnique.mockResolvedValue({ id: 'profile-1', slug: 'ari-artist' });
    const req = { user: { id: USER_ID } } as unknown as Request;
    const res = response();

    await getStudioArtistProfile(req, res.asResponse, vi.fn());

    expect(mocks.profile.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER_ID } }));
    expect(res.mock.json).toHaveBeenCalledWith({ success: true, data: { id: 'profile-1', slug: 'ari-artist' } });
  });

  it('updates only the profile belonging to the authenticated user and persists validated image URLs', async () => {
    mocks.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
    mocks.profile.update.mockResolvedValue({
      id: 'profile-1', displayName: 'Ari', biography: 'A biography with enough detail to meet requirements.',
      artisticStatement: null, mission: null, website: null, slug: 'ari-artist', location: 'Lagos',
      profileImageUrl: image().secureUrl, coverImageUrl: image('cover').secureUrl, verificationStatus: 'VERIFIED',
    });
    const req = {
      user: { id: USER_ID },
      body: {
        displayName: 'Ari', biography: 'A biography with enough detail to meet requirements.',
        location: 'Lagos', profileImage: image(), coverImage: image('cover'),
      },
    } as unknown as Request;
    const res = response();

    await updateArtistProfile(req, res.asResponse, vi.fn());

    expect(mocks.profile.findUnique).toHaveBeenCalledWith({ where: { userId: USER_ID }, select: { id: true } });
    expect(mocks.profile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: USER_ID },
      data: expect.objectContaining({ profileImageUrl: image().secureUrl, coverImageUrl: image('cover').secureUrl }),
    }));
    expect(res.mock.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects an image outside the authenticated artist folder without changing the profile', async () => {
    mocks.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
    const next = vi.fn();
    const req = {
      user: { id: USER_ID },
      body: {
        displayName: 'Ari', biography: 'A biography with enough detail to meet requirements.',
        profileImage: { ...image(), publicId: 'artists/someone-else/profile/portrait' },
      },
    } as unknown as Request;

    await updateArtistProfile(req, response().asResponse, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, code: 'INVALID_CLOUDINARY_ASSET' }));
    expect(mocks.profile.update).not.toHaveBeenCalled();
  });

  it('rejects forged Cloudinary response metadata even when the URL is in the artist folder', async () => {
    mocks.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
    const next = vi.fn();
    const req = {
      user: { id: USER_ID },
      body: {
        displayName: 'Ari', biography: 'A biography with enough detail to meet requirements.',
        profileImage: { ...image(), signature: 'a'.repeat(40) },
      },
    } as unknown as Request;

    await updateArtistProfile(req, response().asResponse, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, code: 'INVALID_CLOUDINARY_ASSET' }));
    expect(mocks.profile.update).not.toHaveBeenCalled();
  });

  it('signs profile and cover uploads into distinct folders for the authenticated artist', () => {
    const res = response();
    getCloudinaryUploadSignature({ user: { id: USER_ID }, query: { purpose: 'profile' } } as unknown as Request, res.asResponse, vi.fn());
    expect(res.mock.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ folder: `artists/${USER_ID}/profile`, apiKey: 'public-key' }),
    }));
    expect(JSON.stringify(res.mock.json.mock.calls[0])).not.toContain('server-secret');
  });
});
