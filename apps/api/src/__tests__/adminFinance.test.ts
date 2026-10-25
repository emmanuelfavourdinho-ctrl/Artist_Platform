import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    order: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    payment: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock('../lib/firebaseAdmin.js', () => ({ adminAuth: { verifyIdToken: vi.fn() } }));

import { app } from '../app.js';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { prisma } from '../lib/prisma.js';

const TOKEN = 'finance-view-test-token';
const ORDER_ID = '10000000-0000-4000-8000-000000000001';
const PAYMENT_ID = '20000000-0000-4000-8000-000000000002';
const CREATED_AT = new Date('2026-10-10T12:00:00.000Z');

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

describe('admin order and payment read access', () => {
  it('requires finance.view on every list and detail endpoint', async () => {
    const paths = [
      `/api/v1/admin/orders`,
      `/api/v1/admin/orders/${ORDER_ID}`,
      `/api/v1/admin/payments`,
      `/api/v1/admin/payments/${PAYMENT_ID}`,
    ];
    for (const path of paths) {
      expect((await request(app).get(path)).status).toBe(401);
    }

    for (const role of ['BUYER', 'MODERATOR']) {
      const agent = loggedIn(role);
      for (const path of paths) {
        expect((await agent.get(path).set('Authorization', `Bearer ${TOKEN}`)).status).toBe(403);
      }
    }
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
  });

  it('allows Finance Admin reads for both resources', async () => {
    const agent = loggedIn('FINANCE_ADMIN');
    vi.mocked(prisma.order.findMany).mockResolvedValue([]);
    vi.mocked(prisma.order.count).mockResolvedValue(0);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.payment.count).mockResolvedValue(0);

    expect((await agent.get('/api/v1/admin/orders').set('Authorization', `Bearer ${TOKEN}`)).status).toBe(200);
    expect((await agent.get('/api/v1/admin/payments').set('Authorization', `Bearer ${TOKEN}`)).status).toBe(200);
  });

  it('validates status, currency, date order, and pagination before querying', async () => {
    const agent = loggedIn('FINANCE_ADMIN');
    const invalid = [
      '/api/v1/admin/orders?status=SUCCEEDED',
      '/api/v1/admin/payments?status=DELIVERED',
      '/api/v1/admin/orders?currency=US',
      '/api/v1/admin/payments?from=2026-10-12T00:00:00.000Z&to=2026-10-01T00:00:00.000Z',
      '/api/v1/admin/orders?pageSize=51',
    ];
    for (const path of invalid) {
      const response = await agent.get(path).set('Authorization', `Bearer ${TOKEN}`);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it('paginates and filters orders by persisted status, currency, dates, and associated references', async () => {
    const agent = loggedIn('FINANCE_ADMIN');
    vi.mocked(prisma.order.findMany).mockResolvedValue([]);
    vi.mocked(prisma.order.count).mockResolvedValue(0);
    const response = await agent
      .get('/api/v1/admin/orders?page=2&pageSize=10&status=CONFIRMED&currency=usd&from=2026-10-01T00:00:00.000Z&to=2026-10-31T23:59:59.999Z&reference=cs_test_123')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination).toEqual({ page: 2, pageSize: 10, total: 0, totalPages: 0 });
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'CONFIRMED',
        currency: { equals: 'USD', mode: 'insensitive' },
        createdAt: { gte: new Date('2026-10-01T00:00:00.000Z'), lte: new Date('2026-10-31T23:59:59.999Z') },
        OR: expect.arrayContaining([
          { checkoutSessionId: 'cs_test_123' },
          { orderNumber: { contains: 'cs_test_123', mode: 'insensitive' } },
        ]),
      }),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: 10,
      take: 10,
      select: expect.not.objectContaining({
        user: expect.anything(),
        shippingAddressSnapshot: expect.anything(),
        billingAddressSnapshot: expect.anything(),
      }),
    }));
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: 'CONFIRMED' }),
    });
  });

  it('filters payments by status, currency, date, and order/payment reference', async () => {
    const agent = loggedIn('FINANCE_ADMIN');
    vi.mocked(prisma.payment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.payment.count).mockResolvedValue(2);
    const response = await agent
      .get('/api/v1/admin/payments?status=SUCCEEDED&currency=USD&from=2026-10-01T00:00:00.000Z&reference=ART-1234')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(prisma.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'SUCCEEDED',
        currency: { equals: 'USD', mode: 'insensitive' },
        createdAt: { gte: new Date('2026-10-01T00:00:00.000Z') },
        OR: expect.arrayContaining([
          { providerPaymentId: 'ART-1234' },
          { order: { is: { orderNumber: { contains: 'ART-1234', mode: 'insensitive' } } } },
        ]),
      }),
      skip: 0,
      take: 20,
      select: expect.not.objectContaining({
        failureReason: expect.anything(),
        order: expect.objectContaining({
          select: expect.not.objectContaining({
            user: expect.anything(),
            shippingAddressSnapshot: expect.anything(),
            billingAddressSnapshot: expect.anything(),
          }),
        }),
      }),
    }));
  });

  it('uses safe explicit selections for details and returns associated payment and item facts', async () => {
    const agent = loggedIn('FINANCE_ADMIN');
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: ORDER_ID,
      orderNumber: 'ART-1234',
      status: 'CONFIRMED',
      subtotal: '100.00',
      shippingAmount: '0.00',
      taxAmount: '0.00',
      discountAmount: '0.00',
      totalAmount: '100.00',
      currency: 'USD',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      _count: { items: 1, payments: 1 },
      items: [],
      payments: [],
    } as never);
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      id: PAYMENT_ID,
      provider: 'stripe',
      providerPaymentId: 'pi_123',
      amount: '100.00',
      currency: 'USD',
      status: 'SUCCEEDED',
      paidAt: CREATED_AT,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      order: { id: ORDER_ID, orderNumber: 'ART-1234', status: 'CONFIRMED', items: [] },
    } as never);

    const orderResponse = await agent.get(`/api/v1/admin/orders/${ORDER_ID}`).set('Authorization', `Bearer ${TOKEN}`);
    const paymentResponse = await agent.get(`/api/v1/admin/payments/${PAYMENT_ID}`).set('Authorization', `Bearer ${TOKEN}`);
    expect(orderResponse.status).toBe(200);
    expect(paymentResponse.status).toBe(200);
    expect(prisma.order.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ORDER_ID },
      select: expect.not.objectContaining({
        user: expect.anything(),
        shippingAddressSnapshot: expect.anything(),
        billingAddressSnapshot: expect.anything(),
      }),
    }));
    expect(prisma.payment.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: PAYMENT_ID },
      select: expect.not.objectContaining({ failureReason: expect.anything() }),
    }));
    const paymentSelect = vi.mocked(prisma.payment.findUnique).mock.calls[0]?.[0]?.select;
    const paymentOrderSelect =
      paymentSelect?.order && typeof paymentSelect.order === 'object'
        ? paymentSelect.order.select
        : undefined;
    expect(paymentOrderSelect).toBeDefined();
    expect(paymentOrderSelect).not.toHaveProperty('user');
    expect(paymentOrderSelect).not.toHaveProperty('shippingAddressSnapshot');
    expect(paymentOrderSelect).not.toHaveProperty('billingAddressSnapshot');
    expect(orderResponse.body.data.payments).toEqual([]);
  });

  it('returns not-found for missing records and a server error for storage failures', async () => {
    const agent = loggedIn('FINANCE_ADMIN');
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(null);
    expect((await agent.get(`/api/v1/admin/orders/${ORDER_ID}`).set('Authorization', `Bearer ${TOKEN}`)).status).toBe(404);
    expect((await agent.get(`/api/v1/admin/payments/${PAYMENT_ID}`).set('Authorization', `Bearer ${TOKEN}`)).status).toBe(404);
    expect((await agent.get('/api/v1/admin/orders/not-a-uuid').set('Authorization', `Bearer ${TOKEN}`)).status).toBe(400);

    vi.mocked(prisma.order.findMany).mockRejectedValue(new Error('storage unavailable'));
    const failed = await agent.get('/api/v1/admin/orders').set('Authorization', `Bearer ${TOKEN}`);
    expect(failed.status).toBe(500);
    expect(failed.body.message).toBe('Internal server error');
  });
});
