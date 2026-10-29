import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    artwork: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../lib/firebaseAdmin.js', () => ({ adminAuth: { verifyIdToken: vi.fn() } }));

import { app } from '../app.js';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { prisma } from '../lib/prisma.js';

const TOKEN = 'art-moderator-token';
const ID = '10000000-0000-4000-8000-000000000001';
const record = (status: string) => ({ id: ID, status, title: 'Blue Study' });

const tx = {
  artwork: { findUnique: vi.fn(), updateMany: vi.fn() },
  artworkModeration: { create: vi.fn() },
  auditLog: { create: vi.fn() },
};
const historyRows: unknown[] = [];
const auditRows: unknown[] = [];

function staff(role = 'MODERATOR') {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'moderator-1',
    firebaseUid: 'firebase-moderator-1',
    email: 'moderator@example.com',
    firstName: 'M',
    lastName: 'One',
    roles: [{ role: { name: role } }],
  } as never);
  vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'firebase-moderator-1' } as never);
  return request(app);
}

function installTransaction(
  initial: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' = 'PENDING_REVIEW',
) {
  let status = initial;
  let reads = 0;
  let releaseReads!: () => void;
  let gate: Promise<void> | null = null;
  tx.artwork.findUnique.mockImplementation(async () => {
    const observed = status;
    reads += 1;
    if (gate && reads <= 2) {
      if (reads === 2) releaseReads();
      await gate;
    }
    return record(observed) as never;
  });
  tx.artwork.updateMany.mockImplementation(async (args: any) => {
    if (status !== args.where.status) return { count: 0 } as never;
    status = args.data.status;
    return { count: 1 } as never;
  });
  historyRows.length = 0;
  auditRows.length = 0;
  tx.artworkModeration.create.mockImplementation(async (args: unknown) => {
    void args;
    return { id: 'history-1' } as never;
  });
  tx.auditLog.create.mockImplementation(async (args: unknown) => {
    void args;
    return { id: 'audit-1' } as never;
  });
  vi.mocked(prisma.$transaction).mockImplementation(async (operation: any) => {
    const startingStatus = status;
    let updated = false;
    let writtenStatus: string | null = null;
    const pendingHistory: unknown[] = [];
    const pendingAudit: unknown[] = [];
    const transaction = {
      artwork: {
        findUnique: tx.artwork.findUnique,
        updateMany: async (args: any) => {
          const result = await tx.artwork.updateMany(args);
          updated = result.count === 1;
          writtenStatus = updated ? args.data.status : null;
          return result;
        },
      },
      artworkModeration: {
        create: async (args: unknown) => {
          const result = await tx.artworkModeration.create(args);
          pendingHistory.push(args);
          return result;
        },
      },
      auditLog: {
        create: async (args: unknown) => {
          const result = await tx.auditLog.create(args);
          pendingAudit.push(args);
          return result;
        },
      },
    };
    try {
      const result = await operation(transaction as never);
      historyRows.push(...pendingHistory);
      auditRows.push(...pendingAudit);
      return result;
    } catch (error) {
      if (updated && status === writtenStatus) status = startingStatus;
      throw error;
    }
  });
  return {
    getStatus: () => status,
    getHistory: () => [...historyRows],
    getAudit: () => [...auditRows],
    raceReads() {
      gate = new Promise<void>((resolve) => {
        releaseReads = resolve;
      });
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tx.artwork.findUnique.mockReset();
  tx.artwork.updateMany.mockReset();
  tx.artworkModeration.create.mockReset();
  tx.auditLog.create.mockReset();
});

describe('admin artwork moderation access and queue', () => {
  it('requires authentication and artworks.moderate permission', async () => {
    const anonymous = await request(app).get('/api/v1/admin/artworks');
    const anonymousDecision = await request(app)
      .patch(`/api/v1/admin/artworks/${ID}`)
      .send({ action: 'approve' });
    expect(anonymous.status).toBe(401);
    expect(anonymousDecision.status).toBe(401);

    const buyer = staff('BUYER');
    const denied = await buyer
      .get('/api/v1/admin/artworks')
      .set('Authorization', `Bearer ${TOKEN}`);
    const deniedDecision = await buyer
      .patch(`/api/v1/admin/artworks/${ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ action: 'approve' });
    expect(denied.status).toBe(403);
    expect(deniedDecision.status).toBe(403);
    expect(prisma.artwork.findMany).not.toHaveBeenCalled();
  });

  it('filters to pending review before pagination and reports the full filtered count', async () => {
    const agent = staff();
    vi.mocked(prisma.artwork.findMany).mockResolvedValue([record('PENDING_REVIEW')] as never);
    vi.mocked(prisma.artwork.count).mockResolvedValue(51);
    const response = await agent
      .get('/api/v1/admin/artworks?page=2&pageSize=50')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(response.status).toBe(200);
    expect(prisma.artwork.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PENDING_REVIEW' },
        skip: 50,
        take: 50,
      }),
    );
    expect(prisma.artwork.count).toHaveBeenCalledWith({ where: { status: 'PENDING_REVIEW' } });
    expect(response.body.pagination).toEqual({ page: 2, pageSize: 50, total: 51, totalPages: 2 });
  });

  it('validates page parameters and returns details only for pending artwork', async () => {
    const agent = staff();
    const invalid = await agent
      .get('/api/v1/admin/artworks?page=0')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(invalid.status).toBe(400);
    vi.mocked(prisma.artwork.findFirst).mockResolvedValue(null);
    const missing = await agent
      .get(`/api/v1/admin/artworks/${ID}`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(missing.status).toBe(404);
    expect(prisma.artwork.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ID, status: 'PENDING_REVIEW' },
      }),
    );
    vi.mocked(prisma.artwork.findFirst).mockResolvedValue(record('PENDING_REVIEW') as never);
    const detail = await agent
      .get(`/api/v1/admin/artworks/${ID}`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe('PENDING_REVIEW');
  });
});

describe('admin artwork moderation decisions', () => {
  it('rejects invalid decisions and rejection reasons before starting a transaction', async () => {
    const agent = staff();
    const invalidAction = await agent
      .patch(`/api/v1/admin/artworks/${ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ action: 'publish' });
    const missingReason = await agent
      .patch(`/api/v1/admin/artworks/${ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ action: 'reject', reason: '   ' });
    const shortReason = await agent
      .patch(`/api/v1/admin/artworks/${ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ action: 'reject', reason: 'bad' });
    expect(invalidAction.status).toBe(400);
    expect(missingReason.status).toBe(400);
    expect(shortReason.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('approves without publishing and records moderator history and audit atomically', async () => {
    const agent = staff();
    installTransaction();
    tx.artwork.findUnique.mockResolvedValue(record('PENDING_REVIEW') as never);
    const response = await agent
      .patch(`/api/v1/admin/artworks/${ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ action: 'approve' });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('APPROVED');
    expect(tx.artwork.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: 'PENDING_REVIEW' },
      data: { status: 'APPROVED' },
    });
    expect(tx.artworkModeration.create).toHaveBeenCalledWith({
      data: {
        artworkId: ID,
        adminId: 'moderator-1',
        action: 'APPROVED',
        reason: null,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'moderator-1',
        action: 'ARTWORK_MODERATED',
        entityType: 'Artwork',
        entityId: ID,
        metadata: { fromStatus: 'PENDING_REVIEW', toStatus: 'APPROVED', decision: 'approve' },
      }),
    });
  });

  it('rejects with a trimmed reason stored in moderation history and audit reason', async () => {
    const agent = staff();
    installTransaction();
    tx.artwork.findUnique.mockResolvedValue(record('PENDING_REVIEW') as never);
    const response = await agent
      .patch(`/api/v1/admin/artworks/${ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ action: 'reject', reason: '  Missing dimensions  ' });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('REJECTED');
    expect(tx.artworkModeration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'REJECTED', reason: 'Missing dimensions' }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reason: 'Missing dimensions',
        metadata: expect.objectContaining({ toStatus: 'REJECTED' }),
      }),
    });
  });

  it('returns 404 for missing and 409 for already decided artwork without creating records', async () => {
    const agent = staff();
    installTransaction('APPROVED');
    tx.artwork.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(record('APPROVED') as never);
    const missing = await agent
      .patch(`/api/v1/admin/artworks/${ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ action: 'reject', reason: 'Please provide more details' });
    const stale = await agent
      .patch(`/api/v1/admin/artworks/${ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ action: 'approve' });
    expect(missing.status).toBe(404);
    expect(stale.status).toBe(409);
    expect(tx.artwork.updateMany).not.toHaveBeenCalled();
    expect(tx.artworkModeration.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('allows exactly one concurrent decision in the conditional-update mock', async () => {
    const agent = staff();
    const state = installTransaction();
    state.raceReads();
    const [approve, reject] = await Promise.all([
      agent
        .patch(`/api/v1/admin/artworks/${ID}`)
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({ action: 'approve' }),
      agent
        .patch(`/api/v1/admin/artworks/${ID}`)
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({ action: 'reject', reason: 'Please provide dimensions' }),
    ]);
    expect([approve.status, reject.status].sort()).toEqual([200, 409]);
    expect(tx.artworkModeration.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(['APPROVED', 'REJECTED']).toContain(state.getStatus());
  });

  it('propagates a failed audit write so the transaction rolls back rather than returning success', async () => {
    const agent = staff();
    const state = installTransaction();
    tx.artwork.findUnique.mockResolvedValue(record('PENDING_REVIEW') as never);
    tx.auditLog.create.mockRejectedValue(new Error('audit unavailable'));
    const response = await agent
      .patch(`/api/v1/admin/artworks/${ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ action: 'approve' });
    expect(response.status).toBe(500);
    expect(tx.artworkModeration.create).toHaveBeenCalledTimes(1);
    expect(state.getStatus()).toBe('PENDING_REVIEW');
    expect(state.getHistory()).toHaveLength(0);
    expect(state.getAudit()).toHaveLength(0);
  });
});
