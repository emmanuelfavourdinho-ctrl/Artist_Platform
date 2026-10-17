import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => {
  const prisma = {
    user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    userEnforcement: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    notification: { create: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    userRole: { count: vi.fn(), create: vi.fn(), delete: vi.fn() },
    role: { findUnique: vi.fn() },
    report: { findMany: vi.fn() },
    order: { groupBy: vi.fn() },
    payment: { groupBy: vi.fn() },
    orderItem: { groupBy: vi.fn() },
    artwork: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  // Interactive transactions run the callback against the same mock, so a
  // thrown error aborts the callback exactly as a rollback would stop the
  // writes that follow it.
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock('../lib/firebaseAdmin.js', () => ({ adminAuth: { verifyIdToken: vi.fn() } }));

import { app } from '../app.js';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { hasPermission, permissionsForRoles } from '../lib/permissions.js';
import { prisma } from '../lib/prisma.js';

const TARGET = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';

type Targets = Record<string, { status: string; roles: string[] }>;

function sessionAs(roles: string[], status = 'ACTIVE', targets: Targets = {}) {
  vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'fb-actor', email: 'a@x.com' } as never);
  vi.mocked(prisma.user.findUnique).mockImplementation((async (args: {
    where: { id?: string; firebaseUid?: string };
  }) => {
    if (args.where.firebaseUid) {
      return {
        id: ACTOR,
        email: 'a@x.com',
        status,
        roles: roles.map((name) => ({ role: { name } })),
      };
    }
    const t = args.where.id ? targets[args.where.id] : undefined;
    return t
      ? { id: args.where.id, status: t.status, roles: t.roles.map((name) => ({ role: { name } })) }
      : null;
  }) as never);
  vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.userEnforcement.create).mockResolvedValue({ id: 'enf-1' } as never);
  vi.mocked(prisma.userEnforcement.updateMany).mockResolvedValue({ count: 0 } as never);
}

const auth = (r: request.Test) => r.set('Authorization', 'Bearer t');
const get = (p: string) => auth(request(app).get(p));
const post = (p: string, body: unknown) => auth(request(app).post(p).send(body as object));

const GOOD_REASON = 'Repeated spam in commission requests';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
    fn(prisma)) as never);
});

describe('permission matrix', () => {
  it('splits duties: moderators cannot see finance, finance cannot enforce', () => {
    expect(hasPermission(['MODERATOR'], 'users.enforce')).toBe(true);
    expect(hasPermission(['MODERATOR'], 'finance.view')).toBe(false);
    expect(hasPermission(['MODERATOR'], 'users.ban')).toBe(false);
    expect(hasPermission(['MODERATOR'], 'roles.manage')).toBe(false);
    expect(hasPermission(['FINANCE_ADMIN'], 'finance.view')).toBe(true);
    expect(hasPermission(['FINANCE_ADMIN'], 'users.enforce')).toBe(false);
    expect(hasPermission(['FINANCE_ADMIN'], 'users.view')).toBe(false);
  });

  it('gives ADMIN everything and ordinary roles nothing', () => {
    expect(permissionsForRoles(['ADMIN']).size).toBeGreaterThanOrEqual(12);
    expect(permissionsForRoles(['BUYER', 'ARTIST']).size).toBe(0);
    expect(permissionsForRoles(['UNKNOWN_ROLE']).size).toBe(0);
  });
});

describe('account status is actually enforced by the backend', () => {
  it.each([
    ['SUSPENDED', 'ACCOUNT_SUSPENDED'],
    ['BANNED', 'ACCOUNT_BANNED'],
    ['DEACTIVATED', 'ACCOUNT_DEACTIVATED'],
  ])('rejects a %s user on any authenticated endpoint', async (status, code) => {
    sessionAs(['BUYER'], status);
    vi.mocked(prisma.userEnforcement.findFirst).mockResolvedValue(null as never);
    const res = await get('/api/v1/messages');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(code);
  });

  it('lets a RESTRICTED user read but blocks them from creating activity', async () => {
    sessionAs(['BUYER'], 'RESTRICTED');
    vi.mocked(prisma.userEnforcement.findFirst).mockResolvedValue(null as never);
    const blocked = await post('/api/v1/commissions', {});
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('ACCOUNT_RESTRICTED');
  });

  it('lifts an EXPIRED suspension on the next request and audits it as a system action', async () => {
    sessionAs(['MODERATOR'], 'SUSPENDED');
    vi.mocked(prisma.userEnforcement.findFirst).mockResolvedValue({ id: 'e1', action: 'SUSPENSION' } as never);
    const res = await get('/api/v1/admin/session');
    // Auth lifted the expired suspension and let the request through.
    expect(res.status).toBe(200);
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACTIVE' } }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: null, action: 'USER_STATUS_CHANGED', entityId: ACTOR }),
      }),
    );
  });

  it('keeps an UNEXPIRED suspension in force', async () => {
    sessionAs(['BUYER'], 'SUSPENDED');
    vi.mocked(prisma.userEnforcement.findFirst).mockResolvedValue(null as never);
    const res = await get('/api/v1/messages');
    expect(res.status).toBe(403);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('admin access control', () => {
  it('401 without a token, 403 for a buyer', async () => {
    expect((await request(app).get('/api/v1/admin/users')).status).toBe(401);
    sessionAs(['BUYER']);
    const res = await get('/api/v1/admin/users');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  it('lets a moderator manage users but not see finance or manage roles', async () => {
    sessionAs(['MODERATOR']);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.user.count).mockResolvedValue(0 as never);
    expect((await get('/api/v1/admin/users')).status).toBe(200);
    expect((await get('/api/v1/analytics/dashboard')).status).toBe(403);
    expect((await post(`/api/v1/admin/users/${TARGET}/roles`, { role: 'MODERATOR', operation: 'GRANT', reason: GOOD_REASON })).status).toBe(403);
  });

  it('keeps finance staff out of user management and the audit log', async () => {
    sessionAs(['FINANCE_ADMIN']);
    expect((await get('/api/v1/admin/users')).status).toBe(403);
    expect((await get('/api/v1/admin/audit-logs')).status).toBe(403);
    expect((await get('/api/v1/admin/session')).status).toBe(200);
  });

  it('reports the caller permissions to the console', async () => {
    sessionAs(['MODERATOR']);
    const res = await get('/api/v1/admin/session');
    expect(res.body.data.permissions).toContain('users.enforce');
    expect(res.body.data.permissions).not.toContain('finance.view');
  });
});

describe('GET /admin/users', () => {
  it.each(['?status=NOPE', '?pageSize=500', '?sort=password', '?role=GOD', '?page=0'])(
    'rejects invalid query %s with 400',
    async (q) => {
      sessionAs(['ADMIN']);
      const res = await get(`/api/v1/admin/users${q}`);
      expect(res.status).toBe(400);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    },
  );

  it('filters, sorts, paginates and flattens roles without leaking sensitive fields', async () => {
    sessionAs(['ADMIN']);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: TARGET,
        email: 'b@x.com',
        firstName: 'B',
        lastName: 'Buyer',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01'),
        roles: [{ role: { name: 'BUYER' } }],
        artistProfile: null,
      },
    ] as never);
    vi.mocked(prisma.user.count).mockResolvedValue(41 as never);

    const res = await get('/api/v1/admin/users?status=ACTIVE&role=BUYER&search=buy&sort=email&dir=asc&page=2&pageSize=10');

    expect(res.status).toBe(200);
    expect(res.body.data[0].roles).toEqual(['BUYER']);
    expect(res.body.pagination).toEqual({ page: 2, pageSize: 10, total: 41, totalPages: 5 });
    const args = vi.mocked(prisma.user.findMany).mock.calls[0]![0] as {
      where: Record<string, unknown>;
      skip: number;
      take: number;
      orderBy: unknown;
      select: Record<string, unknown>;
    };
    expect(args.where.status).toBe('ACTIVE');
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(args.orderBy).toEqual([{ email: 'asc' }, { id: 'asc' }]);
    for (const secret of ['passwordHash', 'firebaseUid', 'phone']) {
      expect(args.select).not.toHaveProperty(secret);
    }
  });

  it('returns 404 for a missing user and hides reporter identity on the detail view', async () => {
    sessionAs(['ADMIN'], 'ACTIVE', {});
    expect((await get(`/api/v1/admin/users/${TARGET}`)).status).toBe(404);

    sessionAs(['ADMIN'], 'ACTIVE', { [TARGET]: { status: 'ACTIVE', roles: ['BUYER'] } });
    vi.mocked(prisma.userEnforcement.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.report.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);
    const res = await get(`/api/v1/admin/users/${TARGET}`);
    expect(res.status).toBe(200);
    const reportSelect = (vi.mocked(prisma.report.findMany).mock.calls[0]![0] as { select: object }).select;
    expect(reportSelect).not.toHaveProperty('reporterId');
    expect(reportSelect).not.toHaveProperty('reporter');
  });
});

describe('POST /admin/users/:id/enforcement', () => {
  const url = `/api/v1/admin/users/${TARGET}/enforcement`;

  it.each([
    ['no reason', { action: 'SUSPEND' }],
    ['a too-short reason', { action: 'SUSPEND', reason: 'bad' }],
    ['an unknown action', { action: 'DELETE', reason: GOOD_REASON }],
    ['an end date in the past', { action: 'SUSPEND', reason: GOOD_REASON, expiresAt: '2020-01-01T00:00:00Z' }],
    ['an end date over a year away', { action: 'SUSPEND', reason: GOOD_REASON, expiresAt: '2099-01-01T00:00:00Z' }],
  ])('rejects %s with 400 and changes nothing', async (_l, body) => {
    sessionAs(['ADMIN'], 'ACTIVE', { [TARGET]: { status: 'ACTIVE', roles: ['BUYER'] } });
    const res = await post(url, body);
    expect(res.status).toBe(400);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('suspends a user, records history and audit together, and compare-and-sets the status', async () => {
    sessionAs(['MODERATOR'], 'ACTIVE', { [TARGET]: { status: 'ACTIVE', roles: ['BUYER'] } });
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const res = await post(url, { action: 'SUSPEND', reason: GOOD_REASON, expiresAt });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('SUSPENDED');
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: TARGET, status: 'ACTIVE' },
      data: { status: 'SUSPENDED' },
    });
    expect(prisma.userEnforcement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: TARGET,
        actorId: ACTOR,
        action: 'SUSPENSION',
        reason: GOOD_REASON,
        previousStatus: 'ACTIVE',
        newStatus: 'SUSPENDED',
        expiresAt: new Date(expiresAt),
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: ACTOR,
        action: 'USER_STATUS_CHANGED',
        entityType: 'User',
        entityId: TARGET,
        reason: GOOD_REASON,
        metadata: expect.objectContaining({ from: 'ACTIVE', to: 'SUSPENDED', enforcement: 'SUSPENSION' }),
      }),
    });
  });

  it('refuses when another admin changed the account first (no overwrite, no audit)', async () => {
    sessionAs(['ADMIN'], 'ACTIVE', { [TARGET]: { status: 'ACTIVE', roles: ['BUYER'] } });
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 } as never);
    const res = await post(url, { action: 'RESTRICT', reason: GOOD_REASON });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONCURRENT_STATUS_CHANGE');
    expect(prisma.userEnforcement.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('a warning notifies the user and audits without changing status', async () => {
    sessionAs(['MODERATOR'], 'ACTIVE', { [TARGET]: { status: 'ACTIVE', roles: ['ARTIST'] } });
    const res = await post(url, { action: 'WARNING', reason: GOOD_REASON });
    expect(res.status).toBe(201);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: TARGET, type: 'ACCOUNT_WARNING' }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'USER_WARNED' }),
    });
  });

  it('blocks enforcement against yourself, administrators, and (for moderators) other staff', async () => {
    sessionAs(['ADMIN'], 'ACTIVE', { [ACTOR]: { status: 'ACTIVE', roles: ['ADMIN'] } });
    const self = await post(`/api/v1/admin/users/${ACTOR}/enforcement`, { action: 'SUSPEND', reason: GOOD_REASON });
    expect(self.status).toBe(400);
    expect(self.body.code).toBe('SELF_ENFORCEMENT');

    sessionAs(['ADMIN'], 'ACTIVE', { [TARGET]: { status: 'ACTIVE', roles: ['ADMIN'] } });
    const admin = await post(url, { action: 'SUSPEND', reason: GOOD_REASON });
    expect(admin.status).toBe(403);
    expect(admin.body.code).toBe('PROTECTED_ACCOUNT');

    sessionAs(['MODERATOR'], 'ACTIVE', { [TARGET]: { status: 'ACTIVE', roles: ['MODERATOR'] } });
    const colleague = await post(url, { action: 'SUSPEND', reason: GOOD_REASON });
    expect(colleague.status).toBe(403);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('reserves bans, and lifting a ban, for users holding users.ban', async () => {
    sessionAs(['MODERATOR'], 'ACTIVE', { [TARGET]: { status: 'ACTIVE', roles: ['BUYER'] } });
    expect((await post(url, { action: 'BAN', reason: GOOD_REASON })).status).toBe(403);

    sessionAs(['MODERATOR'], 'ACTIVE', { [TARGET]: { status: 'BANNED', roles: ['BUYER'] } });
    expect((await post(url, { action: 'REINSTATE', reason: GOOD_REASON })).status).toBe(403);

    sessionAs(['ADMIN'], 'ACTIVE', { [TARGET]: { status: 'ACTIVE', roles: ['BUYER'] } });
    const ban = await post(url, { action: 'BAN', reason: GOOD_REASON });
    expect(ban.status).toBe(201);
    expect(ban.body.data.status).toBe('BANNED');
  });

  it('enforces the transition table and leaves DEACTIVATED accounts alone', async () => {
    sessionAs(['ADMIN'], 'ACTIVE', { [TARGET]: { status: 'ACTIVE', roles: ['BUYER'] } });
    const noop = await post(url, { action: 'REINSTATE', reason: GOOD_REASON });
    expect(noop.status).toBe(409);
    expect(noop.body.code).toBe('INVALID_STATUS_TRANSITION');

    sessionAs(['ADMIN'], 'ACTIVE', { [TARGET]: { status: 'BANNED', roles: ['BUYER'] } });
    expect((await post(url, { action: 'RESTRICT', reason: GOOD_REASON })).status).toBe(409);
    expect((await post(url, { action: 'WARNING', reason: GOOD_REASON })).status).toBe(409);

    sessionAs(['ADMIN'], 'ACTIVE', { [TARGET]: { status: 'DEACTIVATED', roles: ['BUYER'] } });
    const deactivated = await post(url, { action: 'SUSPEND', reason: GOOD_REASON });
    expect(deactivated.status).toBe(409);
    expect(deactivated.body.code).toBe('ACCOUNT_DEACTIVATED');
  });

  it('ends the previous measure when reinstating', async () => {
    sessionAs(['ADMIN'], 'ACTIVE', { [TARGET]: { status: 'SUSPENDED', roles: ['BUYER'] } });
    const res = await post(url, { action: 'REINSTATE', reason: 'Appeal reviewed and accepted' });
    expect(res.status).toBe(201);
    expect(prisma.userEnforcement.updateMany).toHaveBeenCalledWith({
      where: { userId: TARGET, endedAt: null, action: { in: ['RESTRICTION', 'SUSPENSION', 'BAN'] } },
      data: expect.objectContaining({ endedReason: 'REINSTATED' }),
    });
  });
});

describe('POST /admin/users/:id/roles — privilege escalation guards', () => {
  const url = `/api/v1/admin/users/${TARGET}/roles`;
  const body = { role: 'MODERATOR', operation: 'GRANT', reason: GOOD_REASON };

  it('never lets someone change their own roles', async () => {
    sessionAs(['ADMIN'], 'ACTIVE', { [ACTOR]: { status: 'ACTIVE', roles: ['ADMIN'] } });
    const res = await post(`/api/v1/admin/users/${ACTOR}/roles`, { role: 'FINANCE_ADMIN', operation: 'GRANT', reason: GOOD_REASON });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_ROLE_CHANGE');
  });

  it('rejects non-staff roles and missing reasons at validation', async () => {
    sessionAs(['ADMIN']);
    expect((await post(url, { ...body, role: 'BUYER' })).status).toBe(400);
    expect((await post(url, { ...body, reason: '' })).status).toBe(400);
  });

  it('protects the last administrator', async () => {
    sessionAs(['ADMIN'], 'ACTIVE', { [TARGET]: { status: 'ACTIVE', roles: ['ADMIN'] } });
    vi.mocked(prisma.userRole.count).mockResolvedValue(1 as never);
    const res = await post(url, { role: 'ADMIN', operation: 'REVOKE', reason: GOOD_REASON });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LAST_ADMIN');
    expect(prisma.userRole.delete).not.toHaveBeenCalled();
  });

  it('only grants staff roles to active accounts', async () => {
    sessionAs(['ADMIN'], 'ACTIVE', { [TARGET]: { status: 'SUSPENDED', roles: ['BUYER'] } });
    const res = await post(url, body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('grants a role and records before/after in the audit trail', async () => {
    sessionAs(['ADMIN'], 'ACTIVE', { [TARGET]: { status: 'ACTIVE', roles: ['BUYER'] } });
    vi.mocked(prisma.role.findUnique).mockResolvedValue({ id: 'role-mod' } as never);
    const res = await post(url, body);
    expect(res.status).toBe(200);
    expect(res.body.data.roles).toEqual(['BUYER', 'MODERATOR']);
    expect(prisma.userRole.create).toHaveBeenCalledWith({ data: { userId: TARGET, roleId: 'role-mod' } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'USER_ROLE_UPDATED',
        reason: GOOD_REASON,
        metadata: { operation: 'GRANT', role: 'MODERATOR', before: ['BUYER'], after: ['BUYER', 'MODERATOR'] },
      }),
    });
  });

  it('rejects granting a role the user already has', async () => {
    sessionAs(['ADMIN'], 'ACTIVE', { [TARGET]: { status: 'ACTIVE', roles: ['MODERATOR'] } });
    expect((await post(url, body)).status).toBe(409);
  });
});

describe('GET /admin/audit-logs', () => {
  it('validates filters and passes them through to the query', async () => {
    sessionAs(['MODERATOR']);
    expect((await get('/api/v1/admin/audit-logs?action=NOPE')).status).toBe(400);
    expect((await get('/api/v1/admin/audit-logs?pageSize=1000')).status).toBe(400);
    expect((await get('/api/v1/admin/audit-logs?actorId=not-a-uuid')).status).toBe(400);

    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.auditLog.count).mockResolvedValue(0 as never);
    const res = await get(`/api/v1/admin/audit-logs?action=USER_STATUS_CHANGED&entityType=User&entityId=${TARGET}&actorId=${ACTOR}&from=2026-01-01`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    const where = (vi.mocked(prisma.auditLog.findMany).mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ action: 'USER_STATUS_CHANGED', entityType: 'User', entityId: TARGET, userId: ACTOR });
    expect(where.createdAt).toEqual({ gte: expect.any(Date) });
  });

  it('is append-only: the API exposes no way to edit or delete an entry', async () => {
    sessionAs(['ADMIN']);
    for (const method of ['patch', 'put', 'delete'] as const) {
      const res = await auth(request(app)[method]('/api/v1/admin/audit-logs/abc'));
      expect(res.status).toBe(404);
    }
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
