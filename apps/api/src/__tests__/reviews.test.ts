import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    artwork: { findUnique: vi.fn() },
    review: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    orderItem: { findFirst: vi.fn() },
  },
}));

import { app } from '../app.js';
import { hashPassword } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

const REAL_PASSWORD = 'a-genuinely-strong-password-123';

async function loggedInBuyerAgent() {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'buyer-1',
    email: 'buyer@example.com',
    passwordHash: await hashPassword(REAL_PASSWORD),
    firstName: 'Jane',
    lastName: 'Doe',
    roles: [{ role: { name: 'BUYER' } }],
  } as never);

  const agent = request.agent(app);
  await agent
    .post('/api/v1/auth/login')
    .send({ email: 'buyer@example.com', password: REAL_PASSWORD });
  return agent;
}

describe('POST /api/v1/artworks/:artworkId/reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks submission from anyone not logged in', async () => {
    const response = await request(app).post('/api/v1/artworks/artwork-01/reviews').send({
      rating: 5,
      comment: 'This is a perfectly reasonable length comment.',
    });

    expect(response.status).toBe(401);
  });

  it('rejects a rating outside the 1-5 range', async () => {
    const agent = await loggedInBuyerAgent();
    vi.mocked(prisma.artwork.findUnique).mockResolvedValue({ id: 'artwork-01' } as never);

    const response = await agent.post('/api/v1/artworks/artwork-01/reviews').send({
      rating: 9,
      comment: 'This is a perfectly reasonable length comment.',
    });

    expect(response.status).toBe(400);
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it('rejects a comment that is too short (guards against low-effort spam)', async () => {
    const agent = await loggedInBuyerAgent();
    vi.mocked(prisma.artwork.findUnique).mockResolvedValue({ id: 'artwork-01' } as never);

    const response = await agent.post('/api/v1/artworks/artwork-01/reviews').send({
      rating: 5,
      comment: 'short',
    });

    expect(response.status).toBe(400);
  });

  it('returns 404 when the artwork does not exist', async () => {
    const agent = await loggedInBuyerAgent();
    vi.mocked(prisma.artwork.findUnique).mockResolvedValue(null);

    const response = await agent.post('/api/v1/artworks/does-not-exist/reviews').send({
      rating: 5,
      comment: 'This is a perfectly reasonable length comment.',
    });

    expect(response.status).toBe(404);
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it('rejects a second review from the same user for the same artwork', async () => {
    const agent = await loggedInBuyerAgent();
    vi.mocked(prisma.artwork.findUnique).mockResolvedValue({ id: 'artwork-01' } as never);
    vi.mocked(prisma.review.findFirst).mockResolvedValue({ id: 'existing-review' } as never);

    const response = await agent.post('/api/v1/artworks/artwork-01/reviews').send({
      rating: 5,
      comment: 'This is a perfectly reasonable length comment.',
    });

    expect(response.status).toBe(409);
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it('creates a review that always starts PENDING, even if the client tries to sneak in a different status', async () => {
    const agent = await loggedInBuyerAgent();
    vi.mocked(prisma.artwork.findUnique).mockResolvedValue({ id: 'artwork-01' } as never);
    vi.mocked(prisma.review.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.orderItem.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.review.create).mockResolvedValue({
      id: 'review-1',
      status: 'PENDING',
      orderItemId: null,
    } as never);

    const response = await agent.post('/api/v1/artworks/artwork-01/reviews').send({
      rating: 5,
      status: 'APPROVED', // deliberately trying to sneak this in
      comment: 'This is a perfectly reasonable length comment.',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('PENDING');

    // The real proof: the attacker-supplied "status" never made it to
    // the database call at all — stripped by validateBody before this
    // controller even ran.
    const createArgs = vi.mocked(prisma.review.create).mock.calls[0]![0];
    expect(createArgs.data).not.toHaveProperty('status');
  });

  it('labels a review as verified when the reviewer has a delivered order for that artwork', async () => {
    const agent = await loggedInBuyerAgent();
    vi.mocked(prisma.artwork.findUnique).mockResolvedValue({ id: 'artwork-01' } as never);
    vi.mocked(prisma.review.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.orderItem.findFirst).mockResolvedValue({ id: 'order-item-1' } as never);
    vi.mocked(prisma.review.create).mockResolvedValue({
      id: 'review-1',
      status: 'PENDING',
      orderItemId: 'order-item-1',
    } as never);

    const response = await agent.post('/api/v1/artworks/artwork-01/reviews').send({
      rating: 5,
      comment: 'This is a perfectly reasonable length comment.',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.verifiedPurchase).toBe(true);
  });
});

describe('GET /api/v1/artworks/:artworkId/reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only ever queries for APPROVED reviews for that specific artwork', async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValue([]);
    vi.mocked(prisma.review.count).mockResolvedValue(0);

    await request(app).get('/api/v1/artworks/artwork-01/reviews');

    const queryArgs = vi.mocked(prisma.review.findMany).mock.calls[0]![0];
    expect(queryArgs?.where).toEqual(
      expect.objectContaining({ artworkId: 'artwork-01', status: 'APPROVED' }),
    );
  });

  it('does not require login to view approved reviews', async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValue([]);
    vi.mocked(prisma.review.count).mockResolvedValue(0);

    const response = await request(app).get('/api/v1/artworks/artwork-01/reviews');

    expect(response.status).toBe(200);
  });
});
