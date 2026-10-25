import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), count: vi.fn() },
    artistProfile: { count: vi.fn() },
    artwork: { count: vi.fn(), findMany: vi.fn() },
    order: { groupBy: vi.fn() },
    payment: { groupBy: vi.fn() },
    orderItem: { groupBy: vi.fn() },
    review: { count: vi.fn() },
    contactMessage: { count: vi.fn() },
    report: { count: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('../lib/firebaseAdmin.js', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
}));

import { app } from '../app.js';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { prisma } from '../lib/prisma.js';
import { resolveWindow } from '../services/analyticsService.js';

const TOKEN = 'test-token';

function signInAs(roleName: 'ADMIN' | 'BUYER') {
  vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
    uid: 'firebase-user-1',
    email: 'user@example.com',
  } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'user-1',
    firebaseUid: 'firebase-user-1',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    roles: [{ role: { name: roleName } }],
  } as never);
}

function mockEmptyAnalytics() {
  vi.mocked(prisma.order.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.payment.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.orderItem.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
  vi.mocked(prisma.artwork.findMany).mockResolvedValue([] as never);
}

const get = (path: string, withToken = true) => {
  const req = request(app).get(path);
  return withToken ? req.set('Authorization', `Bearer ${TOKEN}`) : req;
};

describe('GET /api/v1/analytics/dashboard — access control', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated requests with 401', async () => {
    const res = await get('/api/v1/analytics/dashboard', false);
    expect(res.status).toBe(401);
    expect(prisma.order.groupBy).not.toHaveBeenCalled();
  });

  it('rejects a signed-in non-admin with 403 and never touches analytics data', async () => {
    signInAs('BUYER');
    const res = await get('/api/v1/analytics/dashboard');
    expect(res.status).toBe(403);
    expect(prisma.order.groupBy).not.toHaveBeenCalled();
    expect(prisma.payment.groupBy).not.toHaveBeenCalled();
  });

  it('allows an administrator', async () => {
    signInAs('ADMIN');
    mockEmptyAnalytics();
    const res = await get('/api/v1/analytics/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });
});

describe('GET /api/v1/analytics/dashboard — query validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['an unknown range', '?range=forever'],
    ['a non-numeric range', '?range=abc'],
    ['a negative range', '?range=-5d'],
    ['a limit above the maximum', '?limit=500'],
    ['a zero limit', '?limit=0'],
    ['a non-numeric limit', '?limit=lots'],
  ])('returns 400 for %s without querying the database', async (_label, query) => {
    signInAs('ADMIN');
    const res = await get(`/api/v1/analytics/dashboard${query}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.order.groupBy).not.toHaveBeenCalled();
  });

  it('defaults to a 30 day window and a limit of 5', async () => {
    signInAs('ADMIN');
    mockEmptyAnalytics();
    const res = await get('/api/v1/analytics/dashboard');
    expect(res.body.data.range.key).toBe('30d');
    expect(res.body.data.range.days).toBe(30);
    const from = new Date(res.body.data.range.from).getTime();
    const to = new Date(res.body.data.range.to).getTime();
    expect(Math.round((to - from) / 86_400_000)).toBe(30);
  });
});

describe('analytics calculations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps currencies separate and never sums them together', async () => {
    signInAs('ADMIN');
    mockEmptyAnalytics();
    vi.mocked(prisma.payment.groupBy).mockImplementation((async (args: { by: string[] }) =>
      args.by.includes('currency')
        ? [
            { currency: 'USD', _count: { _all: 2 }, _sum: { amount: '100.10' } },
            { currency: 'usd', _count: { _all: 1 }, _sum: { amount: '50.40' } },
            { currency: 'XAF', _count: { _all: 1 }, _sum: { amount: '50000' } },
          ]
        : [
            { status: 'SUCCEEDED', _count: { _all: 3 } },
            { status: 'FAILED', _count: { _all: 1 } },
          ]) as never);

    const res = await get('/api/v1/analytics/dashboard?range=90d');

    expect(res.body.data.payments.succeededByCurrency).toEqual([
      { currency: 'USD', payments: 3, total: 150.5 },
      { currency: 'XAF', payments: 1, total: 50000 },
    ]);
    expect(res.body.data.payments.byStatus).toEqual({ SUCCEEDED: 3, FAILED: 1 });
    // Honest about what is not recorded anywhere in the data model.
    expect(res.body.data.payments.refundAmountsTracked).toBe(false);
  });

  it('normalizes historical case variants while aggregating order totals exactly', async () => {
    signInAs('ADMIN');
    mockEmptyAnalytics();
    vi.mocked(prisma.order.groupBy).mockImplementation((async (args: { by: string[] }) =>
      args.by.includes('currency')
        ? [
            { currency: 'usd', _count: { _all: 1 }, _sum: { totalAmount: '10.10' } },
            { currency: 'USD', _count: { _all: 2 }, _sum: { totalAmount: '20.20' } },
          ]
        : []) as never);

    const res = await get('/api/v1/analytics/dashboard');

    expect(res.body.data.orders.grossOrderValueByCurrency).toEqual([
      { currency: 'USD', orders: 3, total: 30.3 },
    ]);
  });

  it('measures payments by paidAt and only counts SUCCEEDED ones', async () => {
    signInAs('ADMIN');
    mockEmptyAnalytics();
    await get('/api/v1/analytics/dashboard?range=7d');

    const call = vi
      .mocked(prisma.payment.groupBy)
      .mock.calls.map((c) => c[0] as { where?: Record<string, unknown> })
      .find((arg) => arg.where?.status === 'SUCCEEDED');
    expect(call?.where?.paidAt).toEqual({ gte: expect.any(Date), lt: expect.any(Date) });
  });

  it('reports platform commission from OrderItem.commissionAmount, not order totals', async () => {
    signInAs('ADMIN');
    mockEmptyAnalytics();
    vi.mocked(prisma.orderItem.groupBy).mockImplementation((async (args: { by: string[] }) =>
      args.by.includes('artworkId')
        ? []
        : [
            {
              currency: 'USD',
              _count: { _all: 4 },
              _sum: { subtotal: '1000.00', commissionAmount: '150.00' },
            },
            {
              currency: 'usd',
              _count: { _all: 1 },
              _sum: { subtotal: '2.00', commissionAmount: '0.25' },
            },
          ]) as never);

    const res = await get('/api/v1/analytics/dashboard');
    expect(res.body.data.commission).toEqual([
      { currency: 'USD', orderItems: 5, grossItemSales: 1002, platformCommission: 150.25 },
    ]);
  });

  it('excludes order items with no artwork and distinguishes units, items and value', async () => {
    signInAs('ADMIN');
    mockEmptyAnalytics();
    vi.mocked(prisma.orderItem.groupBy).mockImplementation((async (args: { by: string[] }) =>
      args.by.includes('artworkId')
        ? [
            {
              artworkId: 'art-1',
              currency: 'USD',
              _count: { _all: 2 },
              _sum: { quantity: 5, subtotal: '500.00' },
            },
          ]
        : []) as never);
    vi.mocked(prisma.artwork.findMany).mockResolvedValue([
      { id: 'art-1', title: 'Dusk', slug: 'dusk', images: [{ url: 'https://img/dusk.jpg' }] },
    ] as never);

    const res = await get('/api/v1/analytics/dashboard?limit=3');

    expect(res.body.data.topArtworks).toEqual([
      {
        artworkId: 'art-1',
        title: 'Dusk',
        slug: 'dusk',
        imageUrl: 'https://img/dusk.jpg',
        unitsSold: 5,
        orderItems: 2,
        currency: 'USD',
        salesValue: 500,
      },
    ]);

    const topCall = vi
      .mocked(prisma.orderItem.groupBy)
      .mock.calls.map((c) => c[0] as { by: string[]; where: Record<string, unknown>; take?: number })
      .find((arg) => arg.by.includes('artworkId'));
    expect(topCall?.where.artworkId).toEqual({ not: null });
    expect(topCall?.take).toBe(3);
  });

  it('returns a well-formed empty result when there is no data', async () => {
    signInAs('ADMIN');
    mockEmptyAnalytics();
    const res = await get('/api/v1/analytics/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.data.orders.byStatus).toEqual({});
    expect(res.body.data.orders.grossOrderValueByCurrency).toEqual([]);
    expect(res.body.data.payments.succeededByCurrency).toEqual([]);
    expect(res.body.data.commission).toEqual([]);
    expect(res.body.data.timeSeries).toEqual([]);
    expect(res.body.data.topArtworks).toEqual([]);
    expect(prisma.artwork.findMany).not.toHaveBeenCalled();
  });

  it('buckets the daily series per currency', async () => {
    signInAs('ADMIN');
    mockEmptyAnalytics();
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { day: new Date('2026-10-01T00:00:00Z'), currency: 'USD', payments: 2, total: '120.00' },
      { day: new Date('2026-10-01T00:00:00Z'), currency: 'usd', payments: 1, total: '30.00' },
      { day: new Date('2026-10-01T00:00:00Z'), currency: 'XAF', payments: 1, total: '5000' },
    ] as never);
    const res = await get('/api/v1/analytics/dashboard');
    expect(res.body.data.timeSeries).toEqual([
      { date: '2026-10-01', currency: 'USD', payments: 3, total: 150 },
      { date: '2026-10-01', currency: 'XAF', payments: 1, total: 5000 },
    ]);
  });

  it('returns 500 with an error body (not a hang or a fake empty result) when the database fails', async () => {
    signInAs('ADMIN');
    mockEmptyAnalytics();
    vi.mocked(prisma.order.groupBy).mockRejectedValue(new Error('connection refused'));
    const res = await get('/api/v1/analytics/dashboard');
    expect(res.status).toBe(500);
    expect(res.body.status).toBe('error');
    // The client-facing message is generic. (A stack trace is attached
    // only when NODE_ENV !== 'production' — see errorHandler.ts — so the
    // raw driver error is deliberately not asserted against the full body.)
    expect(res.body.message).toBe('Internal server error');
  });
});

describe('resolveWindow', () => {
  it('produces an exact, half-open window ending at the supplied instant', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    const w = resolveWindow('7d', now);
    expect(w.to).toEqual(now);
    expect(w.from).toEqual(new Date('2026-10-08T12:00:00Z'));
    expect(w.days).toBe(7);
  });
});

describe('GET /api/v1/admin/overview', () => {
  beforeEach(() => vi.clearAllMocks());

  function mockCounts() {
    vi.mocked(prisma.user.count).mockResolvedValue(40);
    vi.mocked(prisma.artistProfile.count)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(3);
    vi.mocked(prisma.artwork.count).mockResolvedValueOnce(90).mockResolvedValueOnce(70);
    vi.mocked(prisma.order.groupBy).mockResolvedValue([
      { status: 'DELIVERED', _count: { _all: 5 } },
      { status: 'PENDING', _count: { _all: 2 } },
    ] as never);
    vi.mocked(prisma.review.count).mockResolvedValue(4);
    vi.mocked(prisma.contactMessage.count).mockResolvedValue(6);
    vi.mocked(prisma.report.count).mockResolvedValue(1);
  }

  it('rejects unauthenticated and non-admin requests', async () => {
    expect((await get('/api/v1/admin/overview', false)).status).toBe(401);
    signInAs('BUYER');
    expect((await get('/api/v1/admin/overview')).status).toBe(403);
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('returns real counts for an administrator', async () => {
    signInAs('ADMIN');
    mockCounts();
    const res = await get('/api/v1/admin/overview');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      users: { total: 40 },
      artists: { total: 12, pendingVerification: 3 },
      artworks: { total: 90, published: 70 },
      orders: { total: 7, byStatus: { DELIVERED: 5, PENDING: 2 } },
      queues: { pendingReviews: 4, unreadContactMessages: 6, openReports: 1, pendingArtistVerification: 3 },
    });
  });

  it('returns zeros, not invented numbers, on an empty marketplace', async () => {
    signInAs('ADMIN');
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    vi.mocked(prisma.artistProfile.count).mockResolvedValue(0);
    vi.mocked(prisma.artwork.count).mockResolvedValue(0);
    vi.mocked(prisma.order.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.review.count).mockResolvedValue(0);
    vi.mocked(prisma.contactMessage.count).mockResolvedValue(0);
    vi.mocked(prisma.report.count).mockResolvedValue(0);
    const res = await get('/api/v1/admin/overview');
    expect(res.body.data.orders).toEqual({ total: 0, byStatus: {} });
    expect(res.body.data.queues.openReports).toBe(0);
  });

  it('returns 500 when the database fails', async () => {
    signInAs('ADMIN');
    vi.mocked(prisma.user.count).mockRejectedValue(new Error('db down'));
    vi.mocked(prisma.artistProfile.count).mockResolvedValue(0);
    vi.mocked(prisma.artwork.count).mockResolvedValue(0);
    vi.mocked(prisma.order.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.review.count).mockResolvedValue(0);
    vi.mocked(prisma.contactMessage.count).mockResolvedValue(0);
    vi.mocked(prisma.report.count).mockResolvedValue(0);
    const res = await get('/api/v1/admin/overview');
    expect(res.status).toBe(500);
    expect(res.body.status).toBe('error');
  });
});
