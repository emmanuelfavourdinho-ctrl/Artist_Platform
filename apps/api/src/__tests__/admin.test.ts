import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    review: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { app } from '../app.js';
import { hashPassword } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

const REAL_PASSWORD = 'a-genuinely-strong-password-123';

async function mockAdminAccount() {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'admin-1',
    email: 'admin@example.com',
    passwordHash: await hashPassword(REAL_PASSWORD),
    firstName: 'Ada',
    lastName: 'Admin',
    roles: [{ role: { name: 'ADMIN' } }],
  } as never);
}

async function loggedInAdminAgent() {
  await mockAdminAccount();
  const agent = request.agent(app);
  await agent
    .post('/api/v1/auth/login')
    .send({ email: 'admin@example.com', password: REAL_PASSWORD });
  return agent;
}

describe('Admin authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks the moderation queue for anyone not logged in', async () => {
    const response = await request(app).get('/api/v1/admin/reviews');
    expect(response.status).toBe(401);
  });

  it('blocks moderation actions for anyone not logged in', async () => {
    const response = await request(app)
      .patch('/api/v1/admin/reviews/review-1')
      .send({ action: 'approve' });
    expect(response.status).toBe(401);
  });

  it('rejects a login with the wrong password', async () => {
    await mockAdminAccount();

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'totally-the-wrong-password' });

    expect(response.status).toBe(401);
  });

  it('rejects a login for an email with no account, with the SAME error as a wrong password', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'anything-at-all' });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password');
  });

  it('logs in with correct credentials and, holding the ADMIN role, can reach the moderation queue', async () => {
    const agent = await loggedInAdminAgent();

    vi.mocked(prisma.review.findMany).mockResolvedValue([]);
    vi.mocked(prisma.review.count).mockResolvedValue(0);

    const queue = await agent.get('/api/v1/admin/reviews');
    expect(queue.status).toBe(200);
  });

  it('a logged-in user WITHOUT the ADMIN role is forbidden from the moderation queue', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'buyer-1',
      email: 'buyer@example.com',
      passwordHash: await hashPassword(REAL_PASSWORD),
      firstName: 'Bea',
      lastName: 'Buyer',
      roles: [{ role: { name: 'BUYER' } }],
    } as never);

    const agent = request.agent(app);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: 'buyer@example.com', password: REAL_PASSWORD });

    const response = await agent.get('/api/v1/admin/reviews');
    expect(response.status).toBe(403);
  });
});

describe('PATCH /api/v1/admin/reviews/:id (approve/reject)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unknown action value instead of silently ignoring it', async () => {
    const agent = await loggedInAdminAgent();

    const response = await agent
      .patch('/api/v1/admin/reviews/review-1')
      .send({ action: 'delete-everything' });

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 404 for a review id that does not exist', async () => {
    const agent = await loggedInAdminAgent();
    vi.mocked(prisma.review.findUnique).mockResolvedValue(null);

    const response = await agent
      .patch('/api/v1/admin/reviews/does-not-exist')
      .send({ action: 'approve' });

    expect(response.status).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('approving a review flips its status and records an audit log entry, atomically', async () => {
    const agent = await loggedInAdminAgent();
    vi.mocked(prisma.review.findUnique).mockResolvedValue({
      id: 'review-1',
      status: 'PENDING',
    } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([
      { id: 'review-1', status: 'APPROVED' },
      { id: 'audit-1' },
    ] as never);

    const response = await agent
      .patch('/api/v1/admin/reviews/review-1')
      .send({ action: 'approve' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('APPROVED');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
