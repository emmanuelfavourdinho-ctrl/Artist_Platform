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

vi.mock('../lib/firebaseAdmin.js', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
}));

import { app } from '../app.js';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { prisma } from '../lib/prisma.js';

const ADMIN_TOKEN = 'firebase-admin-test-token';

function mockAdminAccount() {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'admin-1',
    firebaseUid: 'firebase-admin-1',
    email: 'admin@example.com',
    firstName: 'Ada',
    lastName: 'Admin',
    roles: [{ role: { name: 'ADMIN' } }],
  } as never);
}

function loggedInAdminAgent() {
  mockAdminAccount();
  vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
    uid: 'firebase-admin-1',
    email: 'admin@example.com',
  } as never);
  return request(app);
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

  it('rejects an invalid Firebase token', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockRejectedValue(new Error('invalid token'));
    const response = await request(app)
      .get('/api/v1/admin/reviews')
      .set('Authorization', 'Bearer invalid-token');
    expect(response.status).toBe(401);
  });

  it('rejects a Firebase user that is not synchronized in PostgreSQL', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'firebase-missing-user',
      email: 'nobody@example.com',
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const response = await request(app)
      .get('/api/v1/admin/reviews')
      .set('Authorization', 'Bearer missing-user-token');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('USER_NOT_FOUND');
  });

  it('logs in with correct credentials and, holding the ADMIN role, can reach the moderation queue', async () => {
    const agent = loggedInAdminAgent();

    vi.mocked(prisma.review.findMany).mockResolvedValue([]);
    vi.mocked(prisma.review.count).mockResolvedValue(0);

    const queue = await agent
      .get('/api/v1/admin/reviews')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(queue.status).toBe(200);
  });

  it('a logged-in user WITHOUT the ADMIN role is forbidden from the moderation queue', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'buyer-1',
      firebaseUid: 'firebase-buyer-1',
      email: 'buyer@example.com',
      firstName: 'Bea',
      lastName: 'Buyer',
      roles: [{ role: { name: 'BUYER' } }],
    } as never);

    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'firebase-buyer-1',
      email: 'buyer@example.com',
    } as never);

    const response = await request(app)
      .get('/api/v1/admin/reviews')
      .set('Authorization', 'Bearer firebase-buyer-token');
    expect(response.status).toBe(403);
  });
});

describe('PATCH /api/v1/admin/reviews/:id (approve/reject)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unknown action value instead of silently ignoring it', async () => {
    const agent = loggedInAdminAgent();

    const response = await agent
      .patch('/api/v1/admin/reviews/review-1')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ action: 'delete-everything' });

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 404 for a review id that does not exist', async () => {
    const agent = loggedInAdminAgent();
    vi.mocked(prisma.review.findUnique).mockResolvedValue(null);

    const response = await agent
      .patch('/api/v1/admin/reviews/does-not-exist')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ action: 'approve' });

    expect(response.status).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('approving a review flips its status and records an audit log entry, atomically', async () => {
    const agent = loggedInAdminAgent();
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
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ action: 'approve' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('APPROVED');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
