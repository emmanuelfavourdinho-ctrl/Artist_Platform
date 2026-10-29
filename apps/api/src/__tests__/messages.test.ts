import { createHash } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({ prisma: {
  user: { findUnique: vi.fn() }, artistProfile: { findUnique: vi.fn() },
  artwork: { findUnique: vi.fn() }, order: { findFirst: vi.fn() }, commissionRequest: { findUnique: vi.fn() },
  conversation: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  message: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  report: { create: vi.fn() }, $transaction: vi.fn(),
} }));
vi.mock('../lib/firebaseAdmin.js', () => ({ adminAuth: { verifyIdToken: vi.fn() } }));
vi.mock('../config/index.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../config/index.js')>();
  return { ...original, config: { ...original.config, cloudinary: { cloudName: 'fine-arts', apiKey: 'public-key', apiSecret: 'test-secret' } } };
});

import { app } from '../app.js';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { prisma } from '../lib/prisma.js';

const BUYER = '11111111-1111-4111-8111-111111111111';
const ARTIST_USER = '22222222-2222-4222-8222-222222222222';
const ARTIST = '33333333-3333-4333-8333-333333333333';
const CONVERSATION = '44444444-4444-4444-8444-444444444444';
const MESSAGE = '55555555-5555-4555-8555-555555555555';

function session(userId = BUYER) {
  vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: `firebase-${userId}` } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: userId, email: 'person@example.test', status: 'ACTIVE',
    roles: [{ role: { name: userId === BUYER ? 'BUYER' : 'ARTIST' } }],
  } as never);
}

const get = (path: string, userId?: string) => {
  if (userId) session(userId);
  return request(app).get(`/api/v1${path}`).set('Authorization', 'Bearer test-token');
};
const post = (path: string, body: unknown, userId?: string) => {
  if (userId) session(userId);
  return request(app).post(`/api/v1${path}`).set('Authorization', 'Bearer test-token').send(body as object);
};

const conversation = (over: Record<string, unknown> = {}) => ({
  id: CONVERSATION, buyerId: BUYER, status: 'OPEN',
  buyer: { id: BUYER, firstName: 'Buyer', lastName: 'One', email: 'private@example.test' },
  artist: { id: ARTIST, userId: ARTIST_USER, displayName: 'Artist One', slug: 'artist-one', profileImageUrl: null },
  commissionRequest: null, artwork: null, order: null, ...over,
});

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: BUYER, email: 'person@example.test', status: 'ACTIVE', roles: [{ role: { name: 'BUYER' } }] } as never);
  vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'firebase-buyer' } as never);
  vi.mocked(prisma.conversation.findUnique).mockResolvedValue(conversation() as never);
  vi.mocked(prisma.conversation.update).mockResolvedValue({} as never);
  vi.mocked(prisma.message.updateMany).mockResolvedValue({ count: 0 } as never);
});

describe('conversation authorization and message history', () => {
  it('lists only the caller’s conversations and returns a role-correct name and unread count', async () => {
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([{ ...conversation(), messages: [{ id: MESSAGE, body: 'Hello', createdAt: new Date(), senderId: ARTIST_USER }], _count: { messages: 2 } }] as never);
    const res = await get('/messages');
    expect(res.status).toBe(200);
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ buyerId: BUYER }, { artist: { userId: BUYER } }] } }));
    expect(res.body.data[0]).toMatchObject({ participant: { name: 'Artist One', role: 'ARTIST' }, unreadCount: 2 });
    expect(res.body.data[0].buyer).not.toHaveProperty('email');
    expect(res.body.data[0].artist).not.toHaveProperty('userId');
  });

  it('shows the buyer identity to the artist participant', async () => {
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([{ ...conversation(), messages: [], _count: { messages: 0 } }] as never);
    const res = await get('/messages', ARTIST_USER);
    expect(res.status).toBe(200);
    expect(res.body.data[0].participant).toMatchObject({ name: 'Buyer One', role: 'BUYER' });
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ buyerId: ARTIST_USER }, { artist: { userId: ARTIST_USER } }] } }));
  });

  it('rejects access to a conversation belonging to someone else', async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(conversation({ buyerId: 'other-buyer' }) as never);
    const res = await get(`/messages/${CONVERSATION}`);
    expect(res.status).toBe(403);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('marks only incoming messages read before returning history', async () => {
    vi.mocked(prisma.message.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([{ id: MESSAGE, body: 'Hi', senderId: ARTIST_USER, sender: { id: ARTIST_USER, firstName: 'Artist', lastName: 'One' }, createdAt: new Date(), readAt: new Date() }] as never);
    const res = await get(`/messages/${CONVERSATION}`);
    expect(res.status).toBe(200);
    expect(prisma.message.updateMany).toHaveBeenCalledWith({ where: { conversationId: CONVERSATION, senderId: { not: BUYER }, readAt: null }, data: { readAt: expect.any(Date) } });
    expect(res.body.data.messages[0].readAt).toBeTruthy();
  });
});

describe('message persistence and idempotency', () => {
  it('persists a message with a client id that can safely deduplicate retries', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValueOnce(null as never).mockResolvedValueOnce({
      id: MESSAGE, conversationId: CONVERSATION, senderId: BUYER, body: 'Hello', attachmentUrl: null,
      sender: { id: BUYER, firstName: 'Buyer', lastName: 'One' }, createdAt: new Date(),
    } as never);
    vi.mocked(prisma.message.create).mockResolvedValue({
      id: MESSAGE, conversationId: CONVERSATION, senderId: BUYER, body: 'Hello', attachmentUrl: null,
      sender: { id: BUYER, firstName: 'Buyer', lastName: 'One' }, createdAt: new Date(),
    } as never);
    const first = await post(`/messages/${CONVERSATION}/messages`, { id: MESSAGE, body: 'Hello' });
    const retry = await post(`/messages/${CONVERSATION}/messages`, { id: MESSAGE, body: 'Hello' });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of a message id for different content', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue({ id: MESSAGE, conversationId: CONVERSATION, senderId: BUYER, body: 'Different', attachmentUrl: null } as never);
    const res = await post(`/messages/${CONVERSATION}/messages`, { id: MESSAGE, body: 'Hello' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MESSAGE_ID_CONFLICT');
  });
});

describe('secure attachments and conversation reports', () => {
  const asset = (conversationId = CONVERSATION, userId = BUYER) => {
    const publicId = `messages/${conversationId}/${userId}/sample`;
    return {
      publicId, secureUrl: `https://res.cloudinary.com/fine-arts/image/authenticated/v12/${publicId}.jpg`,
      resourceType: 'image', format: 'jpg', mimeType: 'image/jpeg', bytes: 1234, version: 12,
      signature: createHash('sha1').update(`public_id=${publicId}&version=12test-secret`).digest('hex'), name: 'sample.jpg',
    };
  };

  it('issues upload signatures only to conversation participants for a scoped authenticated folder', async () => {
    const res = await post(`/messages/${CONVERSATION}/uploads/signature`, {}, BUYER);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ folder: `messages/${CONVERSATION}/${BUYER}`, type: 'authenticated' });
    expect(res.body.data.signature).not.toContain('test-secret');
  });

  it('serves private Cloudinary media only through the authenticated conversation proxy', async () => {
    const publicId = `messages/${CONVERSATION}/${BUYER}/sample`;
    const secureUrl = `https://res.cloudinary.com/fine-arts/image/authenticated/v12/${publicId}.jpg`;
    vi.mocked(prisma.message.findFirst).mockResolvedValue({
      id: MESSAGE, attachmentUrl: secureUrl, attachmentType: 'image/jpeg', attachmentName: 'sample.jpg',
    } as never);
    const cloudFetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    vi.stubGlobal('fetch', cloudFetch);

    const res = await get(`/messages/${CONVERSATION}/attachments/${MESSAGE}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(cloudFetch.mock.calls[0]?.[0]).toContain('/image/authenticated/s--');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).toString()).not.toContain('res.cloudinary.com');
  });

  it('denies attachment access to nonparticipants before looking up the media', async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(conversation({ buyerId: 'other-buyer' }) as never);
    const res = await get(`/messages/${CONVERSATION}/attachments/${MESSAGE}`);
    expect(res.status).toBe(403);
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  it('rejects assets with another user folder or an invalid Cloudinary signature', async () => {
    const foreign = asset(CONVERSATION, ARTIST_USER);
    const res = await post(`/messages/${CONVERSATION}/messages`, { body: '', attachment: foreign });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ATTACHMENT');
    expect(prisma.message.create).not.toHaveBeenCalled();
    const forged = asset(); forged.signature = '0'.repeat(40);
    const invalid = await post(`/messages/${CONVERSATION}/messages`, { body: '', attachment: forged });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_ATTACHMENT');
  });

  it('persists only Cloudinary Admin API-confirmed attachment metadata', async () => {
    const uploaded = asset();
    const verify = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      public_id: uploaded.publicId, secure_url: uploaded.secureUrl, resource_type: 'image', type: 'authenticated',
      format: uploaded.format, bytes: uploaded.bytes, version: uploaded.version,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', verify);
    vi.mocked(prisma.message.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.message.create).mockResolvedValue({
      id: MESSAGE, conversationId: CONVERSATION, senderId: BUYER, body: '', attachmentUrl: uploaded.secureUrl,
      attachmentType: uploaded.mimeType, attachmentName: uploaded.name, attachmentSize: uploaded.bytes,
      sender: { id: BUYER, firstName: 'Buyer', lastName: 'One' }, createdAt: new Date(),
    } as never);

    const res = await post(`/messages/${CONVERSATION}/messages`, { id: MESSAGE, body: '', attachment: uploaded });
    expect(res.status).toBe(201);
    expect(verify).toHaveBeenCalledWith(expect.stringContaining('/resources/image/authenticated/'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }) }));
    expect(prisma.message.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ attachmentUrl: uploaded.secureUrl, attachmentName: uploaded.name, attachmentSize: uploaded.bytes }) }));
    expect(res.body.data).not.toHaveProperty('attachmentUrl');
  });

  it('creates a traceable Report case for the other participant without banning them', async () => {
    vi.mocked(prisma.report.create).mockResolvedValue({ id: 'report-1', status: 'PENDING', createdAt: new Date() } as never);
    const res = await post(`/messages/${CONVERSATION}/report`, { reason: 'Harassment or abusive messages', description: 'Please review this thread.' });
    expect(res.status).toBe(201);
    expect(prisma.report.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reporterId: BUYER, targetType: 'USER', targetId: ARTIST_USER }) }));
  });
});
