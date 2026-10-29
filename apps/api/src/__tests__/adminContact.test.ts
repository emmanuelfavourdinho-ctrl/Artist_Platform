import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    contactMessage: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
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

const STAFF_TOKEN = 'firebase-support-test-token';
const transactionClient = {
  contactMessage: { findUnique: vi.fn(), updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
};

function messageRecord(status: 'UNREAD' | 'READ' | 'REPLIED' | 'ARCHIVED') {
  return {
    id: 'contact-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Order question',
    message: 'Please help with my order.',
    status,
    emailSentAt: null,
    emailError: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  };
}

function loggedInSupportAgent(role = 'MODERATOR') {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'staff-1',
    firebaseUid: 'firebase-staff-1',
    email: 'staff@example.com',
    firstName: 'Sam',
    lastName: 'Support',
    roles: [{ role: { name: role } }],
  } as never);
  vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
    uid: 'firebase-staff-1',
    email: 'staff@example.com',
  } as never);
  return request(app);
}

function mockStatusTransaction(initialStatus: 'UNREAD' | 'READ' | 'REPLIED' | 'ARCHIVED') {
  let currentStatus = initialStatus;
  transactionClient.contactMessage.findUnique.mockImplementation(async () => messageRecord(currentStatus));
  transactionClient.contactMessage.updateMany.mockImplementation(async (args: any) => {
    if (args.where.status !== currentStatus) return { count: 0 } as never;
    currentStatus = args.data.status;
    return { count: 1 } as never;
  });
  transactionClient.auditLog.create.mockResolvedValue({ id: 'audit-1' } as never);
  vi.mocked(prisma.$transaction).mockImplementation(async (operation) =>
    operation(transactionClient as never),
  );
  return { getStatus: () => currentStatus };
}

beforeEach(() => {
  vi.clearAllMocks();
  transactionClient.contactMessage.findUnique.mockReset();
  transactionClient.contactMessage.updateMany.mockReset();
  transactionClient.auditLog.create.mockReset();
});

describe('admin contact-message authorization', () => {
  it('requires login for inbox reads and status updates', async () => {
    const list = await request(app).get('/api/v1/admin/contact-messages');
    const update = await request(app)
      .patch('/api/v1/admin/contact-messages/contact-1')
      .send({ status: 'READ' });

    expect(list.status).toBe(401);
    expect(update.status).toBe(401);
  });

  it('denies a logged-in user without support.manage for both operations', async () => {
    const agent = loggedInSupportAgent('FINANCE_ADMIN');
    const list = await agent
      .get('/api/v1/admin/contact-messages')
      .set('Authorization', `Bearer ${STAFF_TOKEN}`);
    const update = await agent
      .patch('/api/v1/admin/contact-messages/contact-1')
      .set('Authorization', `Bearer ${STAFF_TOKEN}`)
      .send({ status: 'READ' });

    expect(list.status).toBe(403);
    expect(update.status).toBe(403);
    expect(prisma.contactMessage.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/admin/contact-messages pagination', () => {
  it('uses default bounds and returns total and unread counts', async () => {
    const agent = loggedInSupportAgent();
    vi.mocked(prisma.contactMessage.findMany).mockResolvedValue([messageRecord('UNREAD')] as never);
    vi.mocked(prisma.contactMessage.count)
      .mockResolvedValueOnce(47)
      .mockResolvedValueOnce(6);

    const response = await agent
      .get('/api/v1/admin/contact-messages')
      .set('Authorization', `Bearer ${STAFF_TOKEN}`);

    expect(response.status).toBe(200);
    expect(prisma.contactMessage.findMany).toHaveBeenCalledWith({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
    expect(response.body.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 47,
      totalPages: 3,
      unreadTotal: 6,
    });
  });

  it('applies later-page offsets, page-size maximum, and supports an empty last-boundary page', async () => {
    const agent = loggedInSupportAgent();
    vi.mocked(prisma.contactMessage.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contactMessage.count).mockResolvedValueOnce(51).mockResolvedValueOnce(0);

    const response = await agent
      .get('/api/v1/admin/contact-messages?page=2&pageSize=50')
      .set('Authorization', `Bearer ${STAFF_TOKEN}`);

    expect(response.status).toBe(200);
    expect(prisma.contactMessage.findMany).toHaveBeenCalledWith({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'desc' },
      skip: 50,
      take: 50,
    });
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination).toEqual({
      page: 2,
      pageSize: 50,
      total: 51,
      totalPages: 2,
      unreadTotal: 0,
    });
  });

  it('filters Inbox before pagination and counting', async () => {
    const agent = loggedInSupportAgent();
    vi.mocked(prisma.contactMessage.findMany).mockResolvedValue([messageRecord('READ')] as never);
    vi.mocked(prisma.contactMessage.count).mockResolvedValueOnce(21).mockResolvedValueOnce(2);

    const response = await agent
      .get('/api/v1/admin/contact-messages?view=INBOX&page=2&pageSize=20')
      .set('Authorization', `Bearer ${STAFF_TOKEN}`);

    expect(response.status).toBe(200);
    expect(prisma.contactMessage.findMany).toHaveBeenCalledWith({
      where: { status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'desc' }, skip: 20, take: 20,
    });
    expect(prisma.contactMessage.count).toHaveBeenNthCalledWith(1, { where: { status: { not: 'ARCHIVED' } } });
    expect(response.body.pagination).toMatchObject({ page: 2, total: 21, totalPages: 2, unreadTotal: 2 });
  });

  it('filters Archived before pagination and reports only the archived total', async () => {
    const agent = loggedInSupportAgent();
    vi.mocked(prisma.contactMessage.findMany).mockResolvedValue([messageRecord('ARCHIVED')] as never);
    vi.mocked(prisma.contactMessage.count).mockResolvedValueOnce(3);

    const response = await agent
      .get('/api/v1/admin/contact-messages?view=ARCHIVED&page=1&pageSize=2')
      .set('Authorization', `Bearer ${STAFF_TOKEN}`);

    expect(response.status).toBe(200);
    expect(prisma.contactMessage.findMany).toHaveBeenCalledWith({
      where: { status: 'ARCHIVED' }, orderBy: { createdAt: 'desc' }, skip: 0, take: 2,
    });
    expect(prisma.contactMessage.count).toHaveBeenCalledExactlyOnceWith({ where: { status: 'ARCHIVED' } });
    expect(response.body.data[0].status).toBe('ARCHIVED');
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2, unreadTotal: 0 });
  });

  it.each(['?page=0', '?page=10001', '?pageSize=0', '?pageSize=51', '?page=abc']) (
    'rejects invalid pagination query %s',
    async (query) => {
      const agent = loggedInSupportAgent();
      const response = await agent
        .get(`/api/v1/admin/contact-messages${query}`)
        .set('Authorization', `Bearer ${STAFF_TOKEN}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(prisma.contactMessage.findMany).not.toHaveBeenCalled();
    },
  );

  it('rejects an unsupported view filter', async () => {
    const agent = loggedInSupportAgent();
    const response = await agent.get('/api/v1/admin/contact-messages?view=ALL').set('Authorization', `Bearer ${STAFF_TOKEN}`);
    expect(response.status).toBe(400);
    expect(prisma.contactMessage.findMany).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/admin/contact-messages/:id', () => {
  it.each(['READ', 'REPLIED', 'ARCHIVED'] as const)(
    'changes an unread message to %s and audits only actor, id, and statuses',
    async (status) => {
      const agent = loggedInSupportAgent();
      mockStatusTransaction('UNREAD');

      const response = await agent
        .patch('/api/v1/admin/contact-messages/contact-1')
        .set('Authorization', `Bearer ${STAFF_TOKEN}`)
        .set('X-Request-Id', 'contact-test-request')
        .send({ status });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe(status);
      expect(transactionClient.contactMessage.updateMany).toHaveBeenCalledWith({
        where: { id: 'contact-1', status: 'UNREAD' },
        data: { status },
      });
      expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'staff-1',
          action: 'CONTACT_MESSAGE_STATUS_CHANGED',
          entityType: 'ContactMessage',
          entityId: 'contact-1',
          reason: null,
          requestId: 'contact-test-request',
          metadata: { fromStatus: 'UNREAD', toStatus: status },
        },
      });
      const metadata = transactionClient.auditLog.create.mock.calls[0]![0].data.metadata as Record<string, unknown>;
      expect(metadata).not.toHaveProperty('name');
      expect(metadata).not.toHaveProperty('email');
      expect(metadata).not.toHaveProperty('subject');
      expect(metadata).not.toHaveProperty('message');
    },
  );

  it('does not update or audit a genuine no-op status request', async () => {
    const agent = loggedInSupportAgent();
    mockStatusTransaction('READ');

    const response = await agent
      .patch('/api/v1/admin/contact-messages/contact-1')
      .set('Authorization', `Bearer ${STAFF_TOKEN}`)
      .send({ status: 'READ' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('READ');
    expect(transactionClient.contactMessage.updateMany).not.toHaveBeenCalled();
    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
  });

  it('restores an archived message by changing its status without deleting it', async () => {
    const agent = loggedInSupportAgent();
    mockStatusTransaction('ARCHIVED');

    const response = await agent
      .patch('/api/v1/admin/contact-messages/contact-1')
      .set('Authorization', `Bearer ${STAFF_TOKEN}`)
      .send({ status: 'READ' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: 'contact-1', status: 'READ' });
    expect(transactionClient.contactMessage.updateMany).toHaveBeenCalledWith({
      where: { id: 'contact-1', status: 'ARCHIVED' }, data: { status: 'READ' },
    });
    expect(transactionClient.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metadata: { fromStatus: 'ARCHIVED', toStatus: 'READ' } }),
    }));
  });

  it('returns not found if the message does not exist', async () => {
    const agent = loggedInSupportAgent();
    transactionClient.contactMessage.findUnique.mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (operation) =>
      operation(transactionClient as never),
    );

    const response = await agent
      .patch('/api/v1/admin/contact-messages/missing')
      .set('Authorization', `Bearer ${STAFF_TOKEN}`)
      .send({ status: 'READ' });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(transactionClient.contactMessage.updateMany).not.toHaveBeenCalled();
    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid status before opening a transaction', async () => {
    const agent = loggedInSupportAgent();
    const response = await agent
      .patch('/api/v1/admin/contact-messages/contact-1')
      .set('Authorization', `Bearer ${STAFF_TOKEN}`)
      .send({ status: 'DELETED' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns conflict for a lost conditional update without writing an audit record', async () => {
    const agent = loggedInSupportAgent();
    transactionClient.contactMessage.findUnique.mockResolvedValue(messageRecord('UNREAD') as never);
    transactionClient.contactMessage.updateMany.mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (operation) =>
      operation(transactionClient as never),
    );

    const response = await agent
      .patch('/api/v1/admin/contact-messages/contact-1')
      .set('Authorization', `Bearer ${STAFF_TOKEN}`)
      .send({ status: 'ARCHIVED' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CONTACT_MESSAGE_STATUS_CONFLICT');
    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
  });

  it('allows only one of two competing status transitions and audits the winning transition', async () => {
    const agent = loggedInSupportAgent();
    let currentStatus: 'UNREAD' | 'REPLIED' | 'ARCHIVED' = 'UNREAD';
    let readCount = 0;
    let releaseReads!: () => void;
    const bothReadInitial = new Promise<void>((resolve) => { releaseReads = resolve; });
    transactionClient.contactMessage.findUnique.mockImplementation(async () => {
      const snapshot = currentStatus;
      readCount += 1;
      if (readCount <= 2) {
        if (readCount === 2) releaseReads();
        await bothReadInitial;
      }
      return messageRecord(snapshot);
    });
    transactionClient.contactMessage.updateMany.mockImplementation(async (args: any) => {
      if (args.where.status !== currentStatus) return { count: 0 } as never;
      currentStatus = args.data.status;
      return { count: 1 } as never;
    });
    transactionClient.auditLog.create.mockResolvedValue({ id: 'audit-1' } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (operation) =>
      operation(transactionClient as never),
    );

    const [replied, archived] = await Promise.all([
      agent
        .patch('/api/v1/admin/contact-messages/contact-1')
        .set('Authorization', `Bearer ${STAFF_TOKEN}`)
        .send({ status: 'REPLIED' }),
      agent
        .patch('/api/v1/admin/contact-messages/contact-1')
        .set('Authorization', `Bearer ${STAFF_TOKEN}`)
        .send({ status: 'ARCHIVED' }),
    ]);

    expect([replied.status, archived.status].sort()).toEqual([200, 409]);
    expect(transactionClient.auditLog.create).toHaveBeenCalledTimes(1);
    const winner = replied.status === 200 ? replied : archived;
    const audit = transactionClient.auditLog.create.mock.calls[0]![0].data;
    expect(audit.metadata).toEqual({ fromStatus: 'UNREAD', toStatus: winner.body.data.status });
    expect(currentStatus).toBe(winner.body.data.status);
  });

  it('does not turn an unexpected database error into a conflict', async () => {
    const agent = loggedInSupportAgent();
    transactionClient.contactMessage.findUnique.mockResolvedValue(messageRecord('UNREAD') as never);
    transactionClient.contactMessage.updateMany.mockRejectedValue(new Error('database unavailable'));
    vi.mocked(prisma.$transaction).mockImplementation(async (operation) =>
      operation(transactionClient as never),
    );

    const response = await agent
      .patch('/api/v1/admin/contact-messages/contact-1')
      .set('Authorization', `Bearer ${STAFF_TOKEN}`)
      .send({ status: 'READ' });

    expect(response.status).toBe(500);
    expect(response.body.code).not.toBe('CONTACT_MESSAGE_STATUS_CONFLICT');
    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
  });

  it('propagates audit failure as an unexpected error from the transaction', async () => {
    const agent = loggedInSupportAgent();
    mockStatusTransaction('UNREAD');
    transactionClient.auditLog.create.mockRejectedValue(new Error('audit storage unavailable'));

    const response = await agent
      .patch('/api/v1/admin/contact-messages/contact-1')
      .set('Authorization', `Bearer ${STAFF_TOKEN}`)
      .send({ status: 'READ' });

    expect(response.status).toBe(500);
    expect(response.body.code).not.toBe('CONTACT_MESSAGE_STATUS_CONFLICT');
    expect(transactionClient.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
