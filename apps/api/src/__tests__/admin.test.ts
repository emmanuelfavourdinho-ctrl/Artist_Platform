import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    review: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
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

const transactionClient = {
  review: { updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
};

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

function mockModerationTransaction() {
  transactionClient.review.updateMany.mockResolvedValue({ count: 1 } as never);
  transactionClient.auditLog.create.mockResolvedValue({ id: 'audit-1' } as never);
  vi.mocked(prisma.$transaction).mockImplementation(async (operation) =>
    operation(transactionClient as never),
  );
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

  it('a logged-in user WITHOUT reviews.moderate is forbidden from moderation actions', async () => {
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
      .patch('/api/v1/admin/reviews/review-1')
      .set('Authorization', 'Bearer firebase-buyer-token')
      .send({ action: 'approve' });

    expect(response.status).toBe(403);
    expect(prisma.review.findUnique).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/admin/reviews/:id (approve/reject)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionClient.review.updateMany.mockReset();
    transactionClient.auditLog.create.mockReset();
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

  it('approves a pending review and records the matching audit entry atomically', async () => {
    const agent = loggedInAdminAgent();
    vi.mocked(prisma.review.findUnique).mockResolvedValue({
      id: 'review-1',
      status: 'PENDING',
    } as never);
    mockModerationTransaction();

    const response = await agent
      .patch('/api/v1/admin/reviews/review-1')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ action: 'approve' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('APPROVED');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'review-1', status: 'PENDING' },
      data: { status: 'APPROVED' },
    });
    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        action: 'REVIEW_APPROVED',
        entityType: 'Review',
        entityId: 'review-1',
        metadata: undefined,
      },
    });
  });

  it('rejects a pending review and records the matching audit entry', async () => {
    const agent = loggedInAdminAgent();
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ id: 'review-1', status: 'PENDING' } as never);
    mockModerationTransaction();

    const response = await agent
      .patch('/api/v1/admin/reviews/review-1')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ action: 'reject', reason: 'Not a genuine review' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('REJECTED');
    expect(transactionClient.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'review-1', status: 'PENDING' },
      data: { status: 'REJECTED' },
    });
    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        action: 'REVIEW_REJECTED',
        entityType: 'Review',
        entityId: 'review-1',
        metadata: { reason: 'Not a genuine review' },
      },
    });
  });

  it('returns 409 and does not write an audit record for an already moderated review', async () => {
    const agent = loggedInAdminAgent();
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ id: 'review-1', status: 'APPROVED' } as never);

    const response = await agent
      .patch('/api/v1/admin/reviews/review-1')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ action: 'reject' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('REVIEW_ALREADY_MODERATED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows only one of two competing decisions to transition and audit the review', async () => {
    const agent = loggedInAdminAgent();
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ id: 'review-1', status: 'PENDING' } as never);
    let decided = false;
    transactionClient.review.updateMany.mockImplementation(async (args: any) => {
      if (decided || args.where.status !== 'PENDING') return { count: 0 } as never;
      decided = true;
      return { count: 1 } as never;
    });
    transactionClient.auditLog.create.mockResolvedValue({ id: 'audit-1' } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (operation) =>
      operation(transactionClient as never),
    );

    const [approve, reject] = await Promise.all([
      agent
        .patch('/api/v1/admin/reviews/review-1')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ action: 'approve' }),
      agent
        .patch('/api/v1/admin/reviews/review-1')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ action: 'reject' }),
    ]);

    expect([approve.status, reject.status].sort()).toEqual([200, 409]);
    expect(transactionClient.review.updateMany).toHaveBeenCalledTimes(2);
    expect(transactionClient.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/admin/reviews pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses page and pageSize and returns the total pending count', async () => {
    const agent = loggedInAdminAgent();
    vi.mocked(prisma.review.findMany).mockResolvedValue([{ id: 'r4' }, { id: 'r5' }, { id: 'r6' }] as never);
    vi.mocked(prisma.review.count).mockResolvedValue(8);

    const response = await agent
      .get('/api/v1/admin/reviews?page=2&pageSize=3')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
    expect(prisma.review.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 3, take: 3 }));
    expect(response.body.pagination).toEqual({ page: 2, pageSize: 3, total: 8, totalPages: 3 });
  });

  it('clamps page and pageSize to their supported lower and upper bounds', async () => {
    const agent = loggedInAdminAgent();
    vi.mocked(prisma.review.findMany).mockResolvedValue([]);
    vi.mocked(prisma.review.count).mockResolvedValue(0);

    const lower = await agent
      .get('/api/v1/admin/reviews?page=0&pageSize=-3')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(lower.body.pagination).toEqual({ page: 1, pageSize: 1, total: 0, totalPages: 0 });

    const upper = await agent
      .get('/api/v1/admin/reviews?page=2&pageSize=100')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(upper.body.pagination).toEqual({ page: 2, pageSize: 50, total: 0, totalPages: 0 });
    expect(prisma.review.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 50, take: 50 }));
  });
});
