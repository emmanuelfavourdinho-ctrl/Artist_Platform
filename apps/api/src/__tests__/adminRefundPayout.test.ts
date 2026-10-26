import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    refundRequest: { findMany: vi.fn(), count: vi.fn() },
    artistPayout: { findMany: vi.fn(), count: vi.fn() },
    artistOrderFulfillment: { findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock('../lib/firebaseAdmin.js', () => ({ adminAuth: { verifyIdToken: vi.fn() } }));

import { app } from '../app.js';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { prisma } from '../lib/prisma.js';

function loggedIn(role: string) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'staff-1',
    firebaseUid: 'firebase-staff-1',
    email: 'finance@example.com',
    firstName: 'Finance',
    lastName: 'Staff',
    roles: [{ role: { name: role } }],
  } as never);
  vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'firebase-staff-1' } as never);
  return request(app);
}

beforeEach(() => vi.clearAllMocks());

describe('admin refund and payout foundations', () => {
  it('requires authentication and finance.view on operational read endpoints', async () => {
    const paths = [
      '/api/v1/admin/refunds',
      '/api/v1/admin/payouts',
      '/api/v1/admin/payouts/eligible',
    ];
    for (const path of paths) expect((await request(app).get(path)).status).toBe(401);

    const agent = loggedIn('MODERATOR');
    for (const path of paths) {
      expect((await agent.get(path).set('Authorization', 'Bearer test-token')).status).toBe(403);
    }
    expect(prisma.refundRequest.findMany).not.toHaveBeenCalled();
    expect(prisma.artistPayout.findMany).not.toHaveBeenCalled();
    expect(prisma.artistOrderFulfillment.findMany).not.toHaveBeenCalled();
  });

  it('requires explicit operation-management permissions for mutations', async () => {
    const agent = loggedIn('MODERATOR');
    const refundResponse = await agent.post('/api/v1/admin/refunds')
      .set('Authorization', 'Bearer test-token')
      .send({
        paymentId: '10000000-0000-4000-8000-000000000001',
        amountMinorUnits: '100',
        reason: 'Refund after support review',
        idempotencyKey: 'refund-request-0001',
      });
    const payoutResponse = await agent.post('/api/v1/admin/payouts')
      .set('Authorization', 'Bearer test-token')
      .send({
        fulfillmentId: '10000000-0000-4000-8000-000000000001',
        idempotencyKey: 'payout-request-0001',
      });
    expect(refundResponse.status).toBe(403);
    expect(payoutResponse.status).toBe(403);
    expect(prisma.refundRequest.findMany).not.toHaveBeenCalled();
    expect(prisma.artistPayout.findMany).not.toHaveBeenCalled();
  });

  it('does not submit refunds or payouts while the production provider adapter is unconfigured', async () => {
    const agent = loggedIn('FINANCE_ADMIN');
    const id = '10000000-0000-4000-8000-000000000001';
    const refund = await agent.post(`/api/v1/admin/refunds/${id}/submit`)
      .set('Authorization', 'Bearer test-token');
    const payout = await agent.post(`/api/v1/admin/payouts/${id}/submit`)
      .set('Authorization', 'Bearer test-token');

    expect(refund.status).toBe(503);
    expect(refund.body.code).toBe('PROVIDER_UNCONFIGURED');
    expect(payout.status).toBe(503);
    expect(payout.body.code).toBe('PROVIDER_UNCONFIGURED');
    expect(prisma.refundRequest.findMany).not.toHaveBeenCalled();
    expect(prisma.artistPayout.findMany).not.toHaveBeenCalled();
  });

  it('paginates refund operations and returns minor units without buyer details', async () => {
    vi.mocked(prisma.refundRequest.findMany).mockResolvedValue([{
      id: 'refund-1',
      paymentId: 'payment-1',
      amountMinorUnits: 12345n,
      currency: 'USD',
      reason: 'Damaged artwork reported',
      status: 'REQUESTED',
      provider: null,
      providerReference: null,
      attemptCount: 0,
      lastAttemptAt: null,
      lastErrorCode: null,
      createdAt: new Date('2026-10-10T12:00:00Z'),
      updatedAt: new Date('2026-10-10T12:00:00Z'),
      order: { id: 'order-1', orderNumber: 'ART-1001' },
      payment: { status: 'SUCCEEDED' },
    }] as never);
    vi.mocked(prisma.refundRequest.count).mockResolvedValue(31);

    const response = await loggedIn('FINANCE_ADMIN')
      .get('/api/v1/admin/refunds?page=2&pageSize=10&status=REQUESTED&currency=usd&reference=ART-1001')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject([{
      id: 'refund-1',
      amountMinorUnits: '12345',
      currency: 'USD',
      order: { orderNumber: 'ART-1001' },
      payment: { status: 'SUCCEEDED' },
    }]);
    expect(response.body.data[0]).not.toHaveProperty('buyer');
    expect(response.body.data[0]).not.toHaveProperty('shippingAddressSnapshot');
    expect(response.body.pagination).toEqual({ page: 2, pageSize: 10, total: 31, totalPages: 4 });
    expect(prisma.refundRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
      where: expect.objectContaining({
        status: 'REQUESTED',
        currency: { equals: 'USD', mode: 'insensitive' },
      }),
      select: expect.not.objectContaining({
        user: expect.anything(),
        shippingAddressSnapshot: expect.anything(),
      }),
    }));
  });

  it('keeps payout amounts and stored commission as separate exact minor-unit values', async () => {
    vi.mocked(prisma.artistPayout.findMany).mockResolvedValue([{
      id: 'payout-1',
      fulfillmentId: 'fulfillment-1',
      orderId: 'order-1',
      artistId: 'artist-1',
      amountMinorUnits: 9000n,
      commissionMinorUnits: 1000n,
      currency: 'USD',
      status: 'APPROVED',
      provider: null,
      providerReference: null,
      attemptCount: 0,
      lastAttemptAt: null,
      lastErrorCode: null,
      createdAt: new Date('2026-10-10T12:00:00Z'),
      updatedAt: new Date('2026-10-10T12:00:00Z'),
      order: { id: 'order-1', orderNumber: 'ART-1001' },
    }] as never);
    vi.mocked(prisma.artistPayout.count).mockResolvedValue(1);

    const response = await loggedIn('FINANCE_ADMIN')
      .get('/api/v1/admin/payouts?status=APPROVED&page=1&pageSize=5')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      amountMinorUnits: '9000',
      commissionMinorUnits: '1000',
      status: 'APPROVED',
    });
    expect(response.body.data[0]).not.toHaveProperty('artist.email');
    expect(prisma.artistPayout.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 5,
    }));
  });

  it('rejects invalid filters before database queries', async () => {
    const agent = loggedIn('FINANCE_ADMIN');
    for (const path of [
      '/api/v1/admin/refunds?status=PAID',
      '/api/v1/admin/payouts?currency=US',
      '/api/v1/admin/refunds?pageSize=51',
      '/api/v1/admin/payouts?from=2026-10-12&to=2026-10-01',
    ]) {
      const response = await agent.get(path).set('Authorization', 'Bearer test-token');
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
    expect(prisma.refundRequest.findMany).not.toHaveBeenCalled();
    expect(prisma.artistPayout.findMany).not.toHaveBeenCalled();
  });
});
