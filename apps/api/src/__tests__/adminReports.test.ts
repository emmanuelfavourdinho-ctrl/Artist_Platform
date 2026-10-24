import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    artistProfile: { findUnique: vi.fn() },
    artwork: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    report: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock('../lib/firebaseAdmin.js', () => ({ adminAuth: { verifyIdToken: vi.fn() } }));

import { app } from '../app.js';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { prisma } from '../lib/prisma.js';

const TOKEN = 'report-test-token';
const REPORT_ID = '10000000-0000-4000-8000-000000000001';
const ACTOR = {
  id: 'moderator-1',
  firebaseUid: 'firebase-moderator-1',
  email: 'staff@example.com',
  firstName: 'M',
  lastName: 'One',
  roles: [{ role: { name: 'MODERATOR' } }],
};
const auditRows: unknown[] = [];
let currentStatus: 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED' = 'PENDING';
let raceReads = false;
let readCount = 0;
let releaseReads: () => void;
let readGate: Promise<void>;

const tx = {
  report: {
    findUnique: vi.fn(async () => ({ id: REPORT_ID, targetType: 'USER', status: currentStatus })),
    updateMany: vi.fn(async (args: any) => {
      if (currentStatus !== args.where.status) return { count: 0 };
      currentStatus = args.data.status;
      return { count: 1 };
    }),
  },
  auditLog: { create: vi.fn(async () => ({ id: 'audit-1' })) },
};

function loggedIn(role = 'MODERATOR') {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    ...ACTOR,
    roles: [{ role: { name: role } }],
  } as never);
  vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'firebase-moderator-1' } as never);
  return request(app);
}

beforeEach(() => {
  vi.clearAllMocks();
  auditRows.length = 0;
  currentStatus = 'PENDING';
  raceReads = false;
  readCount = 0;
  tx.report.findUnique.mockImplementation(async () => {
    const result = { id: REPORT_ID, targetType: 'USER', status: currentStatus };
    if (raceReads && readCount < 2) {
      readCount += 1;
      if (readCount === 2) releaseReads();
      await readGate;
      return { ...result, status: 'PENDING' };
    }
    return result;
  });
  tx.report.updateMany.mockImplementation(async (args: any) => {
    if (currentStatus !== args.where.status) return { count: 0 } as never;
    currentStatus = args.data.status;
    return { count: 1 } as never;
  });
  tx.auditLog.create.mockImplementation(async () => ({ id: 'audit-1' }) as never);
  vi.mocked(prisma.$transaction).mockImplementation(async (operation: any) => {
    const startingStatus = currentStatus;
    let changed = false;
    const pendingAudit: unknown[] = [];
    const transaction = {
      report: {
        findUnique: tx.report.findUnique,
        updateMany: async (args: any) => {
          const result = await tx.report.updateMany(args);
          if (result.count === 1) changed = true;
          return result;
        },
      },
      auditLog: {
        create: async (args: unknown) => {
          const result = await tx.auditLog.create();
          pendingAudit.push(args);
          return result;
        },
      },
    };
    try {
      const result = await operation(transaction as never);
      auditRows.push(...pendingAudit);
      return result;
    } catch (error) {
      if (changed) currentStatus = startingStatus;
      throw error;
    }
  });
});

describe('admin Reports & Investigations API', () => {
  it('requires authentication and reports.manage for queue and decisions', async () => {
    expect((await request(app).get('/api/v1/admin/reports')).status).toBe(401);
    const buyer = loggedIn('BUYER');
    expect(
      (await buyer.get('/api/v1/admin/reports').set('Authorization', `Bearer ${TOKEN}`)).status,
    ).toBe(403);
    expect(
      (
        await buyer
          .patch(`/api/v1/admin/reports/${REPORT_ID}`)
          .set('Authorization', `Bearer ${TOKEN}`)
          .send({ status: 'REVIEWING' })
      ).status,
    ).toBe(403);
    expect(prisma.report.findMany).not.toHaveBeenCalled();
  });

  it('creates reports only for authenticated users and resolves public target slugs', async () => {
    const anonymous = await request(app)
      .post('/api/v1/reports')
      .send({ targetType: 'USER', targetSlug: 'artist-one', reason: 'Impersonation' });
    expect(anonymous.status).toBe(401);
    vi.mocked(prisma.artistProfile.findUnique).mockResolvedValue({
      userId: 'reported-user',
    } as never);
    vi.mocked(prisma.report.create).mockResolvedValue({
      id: REPORT_ID,
      status: 'PENDING',
      createdAt: new Date(),
    } as never);
    const response = await loggedIn('BUYER')
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ targetType: 'USER', targetSlug: 'artist-one', reason: '  Impersonation  ' });
    expect(response.status).toBe(201);
    expect(prisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reporterId: ACTOR.id,
          targetId: 'reported-user',
          targetType: 'USER',
          reason: 'Impersonation',
        }),
      }),
    );
  });

  it('rejects malformed and missing target reports before creating a row', async () => {
    const agent = loggedIn('BUYER');
    const malformed = await agent
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ targetType: 'USER', targetSlug: 'bad slug', reason: 'Spam' });
    expect(malformed.status).toBe(400);
    vi.mocked(prisma.artistProfile.findUnique).mockResolvedValue(null as never);
    const missing = await agent
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ targetType: 'USER', targetSlug: 'unknown-artist', reason: 'Spam' });
    expect(missing.status).toBe(404);
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it('accepts only a public published artwork target', async () => {
    const agent = loggedIn('BUYER');
    vi.mocked(prisma.artwork.findFirst).mockResolvedValue({ id: 'artwork-1' } as never);
    vi.mocked(prisma.report.create).mockResolvedValue({
      id: REPORT_ID,
      status: 'PENDING',
      createdAt: new Date(),
    } as never);
    const response = await agent
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ targetType: 'ARTWORK', targetSlug: 'blue-study', reason: 'Misattributed work' });
    expect(response.status).toBe(201);
    expect(prisma.artwork.findFirst).toHaveBeenCalledWith({
      where: { slug: 'blue-study', status: 'PUBLISHED', visibility: 'PUBLIC' },
      select: { id: true },
    });
    expect(prisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ targetType: 'ARTWORK', targetId: 'artwork-1' }),
      }),
    );
  });

  it('validates target and paging inputs, filters before pagination, and returns filtered totals without reporter identity', async () => {
    const agent = loggedIn();
    const invalid = await agent
      .get('/api/v1/admin/reports?page=0')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(invalid.status).toBe(400);
    vi.mocked(prisma.report.findMany).mockResolvedValue([
      {
        id: REPORT_ID,
        targetType: 'USER',
        targetId: 'user-2',
        reason: 'Spam',
        description: null,
        status: 'REVIEWING',
        resolutionNote: null,
        reviewedBy: 'mod-1',
        reviewedAt: null,
        createdAt: new Date(),
      },
    ] as never);
    vi.mocked(prisma.report.count).mockResolvedValue(23);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'user-2',
        firstName: 'Taylor',
        lastName: 'Artist',
        status: 'ACTIVE',
        artistProfile: { displayName: 'Taylor', slug: 'taylor' },
      },
    ] as never);
    const response = await agent
      .get('/api/v1/admin/reports?status=OPEN&page=2&pageSize=10')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(response.status).toBe(200);
    const where = { status: { in: ['PENDING', 'REVIEWING'] } };
    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 10, take: 10 }),
    );
    expect(prisma.report.count).toHaveBeenCalledWith({ where });
    expect(response.body.pagination).toEqual({ page: 2, pageSize: 10, total: 23, totalPages: 3 });
    expect(response.body.data[0].subject.artistProfile.slug).toBe('taylor');
    expect(response.body.data[0].subject).not.toHaveProperty('id');
    expect(response.body.data[0]).not.toHaveProperty('reporterId');
    expect(response.body.data[0]).not.toHaveProperty('targetId');
    expect(response.body.data[0]).not.toHaveProperty('reviewedBy');
  });

  it('returns missing report subjects safely and returns 404 for unknown report details', async () => {
    const agent = loggedIn();
    vi.mocked(prisma.user.findUnique).mockImplementation((async (args: any) =>
      args.where.firebaseUid ? ACTOR : null) as never);
    vi.mocked(prisma.report.findUnique)
      .mockResolvedValueOnce({
        id: REPORT_ID,
        targetType: 'USER',
        targetId: 'deleted-user',
        reason: 'Spam',
        description: null,
        status: 'PENDING',
        resolutionNote: null,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: new Date(),
      } as never)
      .mockResolvedValueOnce(null as never);
    const missingSubject = await agent
      .get(`/api/v1/admin/reports/${REPORT_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(missingSubject.status).toBe(200);
    expect(missingSubject.body.data.subject).toBeNull();
    expect(missingSubject.body.data).not.toHaveProperty('targetId');
    const missingReport = await agent
      .get(`/api/v1/admin/reports/${REPORT_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(missingReport.status).toBe(404);
  });

  it('requires a final resolution note and permits the documented status transitions', async () => {
    const agent = loggedIn();
    const missingNote = await agent
      .patch(`/api/v1/admin/reports/${REPORT_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ status: 'RESOLVED' });
    expect(missingNote.status).toBe(400);
    const reviewing = await agent
      .patch(`/api/v1/admin/reports/${REPORT_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ status: 'REVIEWING' });
    expect(reviewing.status).toBe(200);
    expect(currentStatus).toBe('REVIEWING');
    expect(auditRows).toHaveLength(1);
    expect((auditRows[0] as any).data).toEqual(
      expect.objectContaining({
        userId: ACTOR.id,
        action: 'REPORT_REVIEWED',
        metadata: expect.objectContaining({ fromStatus: 'PENDING', toStatus: 'REVIEWING' }),
      }),
    );
  });

  it('resolves with a trimmed note and records actor, transition, and resolution in one transaction', async () => {
    const response = await loggedIn()
      .patch(`/api/v1/admin/reports/${REPORT_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ status: 'RESOLVED', resolutionNote: '  Confirmed the reported behavior.  ' });
    expect(response.status).toBe(200);
    expect(currentStatus).toBe('RESOLVED');
    expect(tx.report.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REPORT_ID, status: 'PENDING' },
        data: expect.objectContaining({
          status: 'RESOLVED',
          reviewedBy: ACTOR.id,
          resolutionNote: 'Confirmed the reported behavior.',
        }),
      }),
    );
    expect(auditRows).toHaveLength(1);
    expect((auditRows[0] as any).data).toEqual(
      expect.objectContaining({
        userId: ACTOR.id,
        action: 'REPORT_REVIEWED',
        reason: 'Confirmed the reported behavior.',
        metadata: expect.objectContaining({ fromStatus: 'PENDING', toStatus: 'RESOLVED' }),
      }),
    );
  });

  it('dismisses a reviewing report with a resolution note and rejects repeated transitions', async () => {
    currentStatus = 'REVIEWING';
    const agent = loggedIn();
    const dismissed = await agent
      .patch(`/api/v1/admin/reports/${REPORT_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ status: 'DISMISSED', resolutionNote: 'Evidence did not support the report.' });
    expect(dismissed.status).toBe(200);
    expect(currentStatus).toBe('DISMISSED');
    expect((auditRows[0] as any).data.metadata).toEqual(
      expect.objectContaining({ fromStatus: 'REVIEWING', toStatus: 'DISMISSED' }),
    );
    const repeated = await agent
      .patch(`/api/v1/admin/reports/${REPORT_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ status: 'RESOLVED', resolutionNote: 'Another note was supplied.' });
    expect(repeated.status).toBe(409);
    expect(auditRows).toHaveLength(1);
  });

  it.each([
    ['PENDING', 'DISMISSED'],
    ['REVIEWING', 'RESOLVED'],
  ] as const)('allows %s → %s with a recorded resolution', async (from, to) => {
    currentStatus = from;
    const result = await loggedIn()
      .patch(`/api/v1/admin/reports/${REPORT_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ status: to, resolutionNote: 'Reviewed the evidence carefully.' });
    expect(result.status).toBe(200);
    expect(currentStatus).toBe(to);
    expect((auditRows[0] as any).data.metadata).toEqual(
      expect.objectContaining({ fromStatus: from, toStatus: to }),
    );
  });

  it.each(['REVIEWING', 'RESOLVED', 'DISMISSED'] as const)(
    'rejects reopening or repeating a %s report without an audit entry',
    async (from) => {
      currentStatus = from;
      const response = await loggedIn()
        .patch(`/api/v1/admin/reports/${REPORT_ID}`)
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({ status: 'REVIEWING' });
      expect(response.status).toBe(409);
      expect(currentStatus).toBe(from);
      expect(auditRows).toHaveLength(0);
    },
  );

  it('rolls back a status change when writing its audit record fails', async () => {
    tx.auditLog.create.mockRejectedValueOnce(new Error('audit storage unavailable'));
    const response = await loggedIn()
      .patch(`/api/v1/admin/reports/${REPORT_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ status: 'RESOLVED', resolutionNote: 'Confirmed the reported behavior.' });
    expect(response.status).toBe(500);
    expect(currentStatus).toBe('PENDING');
    expect(auditRows).toHaveLength(0);
  });

  it('does not decide stale terminal reports or create their audit entries', async () => {
    currentStatus = 'RESOLVED';
    const response = await loggedIn()
      .patch(`/api/v1/admin/reports/${REPORT_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ status: 'DISMISSED', resolutionNote: 'Reviewed and confirmed.' });
    expect(response.status).toBe(409);
    expect(auditRows).toHaveLength(0);
    expect(tx.report.updateMany).not.toHaveBeenCalled();
  });

  it('allows only one competing status change to win and audit the transition', async () => {
    raceReads = true;
    readGate = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const agent = loggedIn();
    const results = await Promise.all([
      agent
        .patch(`/api/v1/admin/reports/${REPORT_ID}`)
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({ status: 'RESOLVED', resolutionNote: 'Confirmed policy violation.' }),
      agent
        .patch(`/api/v1/admin/reports/${REPORT_ID}`)
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({ status: 'DISMISSED', resolutionNote: 'Reviewed and found no violation.' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(currentStatus === 'RESOLVED' || currentStatus === 'DISMISSED').toBe(true);
    expect(auditRows).toHaveLength(1);
  });
});
