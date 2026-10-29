import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    financialActivity: { findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock('../lib/firebaseAdmin.js', () => ({ adminAuth: { verifyIdToken: vi.fn() } }));

import { app } from '../app.js';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { prisma } from '../lib/prisma.js';

const TOKEN = 'financial-activity-test-token';

function loggedIn(role: string) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'staff-1',
    firebaseUid: 'firebase-staff-1',
    email: 'staff@example.com',
    firstName: 'Finance',
    lastName: 'Staff',
    roles: [{ role: { name: role } }],
  } as never);
  vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'firebase-staff-1' } as never);
  return request(app);
}

beforeEach(() => vi.clearAllMocks());

describe('admin financial activity read access', () => {
  it('requires finance.view and rejects unauthorized and forbidden callers before querying', async () => {
    const path = '/api/v1/admin/financial-activities';
    expect((await request(app).get(path)).status).toBe(401);

    for (const role of ['BUYER', 'MODERATOR']) {
      const response = await loggedIn(role).get(path).set('Authorization', `Bearer ${TOKEN}`);
      expect(response.status).toBe(403);
    }
    expect(prisma.financialActivity.findMany).not.toHaveBeenCalled();
    expect(prisma.financialActivity.count).not.toHaveBeenCalled();
  });

  it('returns exact minor-unit amounts with pagination and validated filters, excluding buyer data', async () => {
    const activity = {
      id: 'activity-1',
      movementIdentifier: 'stripe:checkout-payment-confirmed:pi_123',
      movementType: 'CHECKOUT_PAYMENT_CONFIRMED',
      amountMinorUnits: 12500n,
      currency: 'USD',
      provider: 'stripe',
      providerObjectReference: 'pi_123',
      occurredAt: new Date('2026-10-10T12:00:00.000Z'),
      recordedAt: new Date('2026-10-10T12:01:00.000Z'),
      sourceEventId: 'evt_123',
      checkoutSessionId: 'cs_123',
      order: { id: 'order-1', orderNumber: 'ART-1234' },
      payment: { id: 'payment-1', status: 'SUCCEEDED' },
    };
    vi.mocked(prisma.financialActivity.findMany).mockResolvedValue([activity] as never);
    vi.mocked(prisma.financialActivity.count).mockResolvedValue(21);

    const response = await loggedIn('FINANCE_ADMIN')
      .get(
        '/api/v1/admin/financial-activities?page=2&pageSize=10&movementType=CHECKOUT_PAYMENT_CONFIRMED&provider=Stripe&currency=usd&from=2026-10-01T00:00:00.000Z&to=2026-10-31T23:59:59.999Z&reference=pi_123',
      )
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject([
      {
        movementIdentifier: 'stripe:checkout-payment-confirmed:pi_123',
        amountMinorUnits: '12500',
        amount: '125.00',
        currency: 'USD',
        providerObjectReference: 'pi_123',
        order: { orderNumber: 'ART-1234' },
      },
    ]);
    expect(response.body.data[0]).not.toHaveProperty('buyer');
    expect(response.body.data[0]).not.toHaveProperty('shippingAddressSnapshot');
    expect(response.body.pagination).toEqual({ page: 2, pageSize: 10, total: 21, totalPages: 3 });
    expect(prisma.financialActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          movementType: 'CHECKOUT_PAYMENT_CONFIRMED',
          provider: { equals: 'Stripe', mode: 'insensitive' },
          currency: { equals: 'USD', mode: 'insensitive' },
          recordedAt: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lte: new Date('2026-10-31T23:59:59.999Z'),
          },
          OR: expect.arrayContaining([
            { providerObjectReference: { contains: 'pi_123', mode: 'insensitive' } },
            { sourceEventId: 'pi_123' },
          ]),
        }),
        orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }],
        skip: 10,
        take: 10,
        select: expect.not.objectContaining({
          user: expect.anything(),
          shippingAddressSnapshot: expect.anything(),
          billingAddressSnapshot: expect.anything(),
        }),
      }),
    );
  });

  it('rejects invalid movement types and currencies before querying', async () => {
    const agent = loggedIn('FINANCE_ADMIN');
    for (const path of [
      '/api/v1/admin/financial-activities?movementType=ARTIST_PAYOUT',
      '/api/v1/admin/financial-activities?currency=US',
      '/api/v1/admin/financial-activities?pageSize=51',
    ]) {
      const response = await agent.get(path).set('Authorization', `Bearer ${TOKEN}`);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
    expect(prisma.financialActivity.findMany).not.toHaveBeenCalled();
  });
});
