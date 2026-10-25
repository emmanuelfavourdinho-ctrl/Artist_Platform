import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    order: { findFirst: vi.fn() },
    artistProfile: { findUnique: vi.fn() },
  },
}));

vi.mock('../services/orderDeliveryService.js', () => ({
  appendDeliveryEvent: vi.fn(),
  ensureArtistFulfillments: vi.fn(),
  lockOrderForDelivery: vi.fn(),
  notifyOrderParties: vi.fn(),
  updateReleaseEligibility: vi.fn(),
}));

vi.mock('../services/auditService.js', () => ({ recordAudit: vi.fn() }));

import {
  confirmBuyerReceipt,
  getArtistOrderFulfillment,
  getBuyerOrderDelivery,
} from './orderDeliveryController.js';
import { prisma } from '../lib/prisma.js';
import {
  appendDeliveryEvent,
  lockOrderForDelivery,
  notifyOrderParties,
  updateReleaseEligibility,
} from '../services/orderDeliveryService.js';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const BUYER_ID = '22222222-2222-4222-8222-222222222222';
const ARTIST_ID = '33333333-3333-4333-8333-333333333333';

function requestFor(userId: string) {
  return {
    params: { orderId: ORDER_ID },
    user: { id: userId },
  } as never;
}

describe('order delivery controller ownership checks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('queries buyer delivery only for the authenticated order owner', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null as never);

    await expect(
      getBuyerOrderDelivery(requestFor(BUYER_ID), { json: vi.fn() } as never),
    ).rejects.toMatchObject({ status: 404, code: 'ORDER_NOT_FOUND' });

    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ORDER_ID, userId: BUYER_ID } }),
    );
  });

  it('scopes artist fulfillment lookup to orders containing that artist', async () => {
    vi.mocked(prisma.artistProfile.findUnique).mockResolvedValue({ id: ARTIST_ID } as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null as never);

    await expect(
      getArtistOrderFulfillment(requestFor(BUYER_ID), { json: vi.fn() } as never),
    ).rejects.toMatchObject({ status: 404, code: 'ORDER_NOT_FOUND' });

    expect(prisma.artistProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: BUYER_ID },
      select: { id: true },
    });
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ORDER_ID, items: { some: { artistId: ARTIST_ID } } },
      }),
    );
  });

  it('allows explicit receipt confirmation for a delivered legacy order without a receipt timestamp', async () => {
    const orderRecord = {
      id: ORDER_ID,
      orderNumber: 'ORD-1',
      status: 'DELIVERED',
      buyerReceivedGoodAt: null,
      artistFulfillments: [{ shippedAt: new Date('2026-01-01T00:00:00Z') }],
    };
    const tx = {
      order: {
        findFirst: vi.fn().mockResolvedValue(orderRecord),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          buyerReceivedGoodAt: new Date('2026-01-02T00:00:00Z'),
          artistResponseDeadline: new Date('2026-01-04T00:00:00Z'),
          releaseStatus: 'NOT_ELIGIBLE',
          releaseEligibleAt: null,
        }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));
    const json = vi.fn();

    await confirmBuyerReceipt(requestFor(BUYER_ID), { json } as never);

    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        buyerReceivedGoodAt: null,
        status: { in: ['SHIPPED', 'DELIVERED'] },
      }),
      data: expect.objectContaining({ status: 'DELIVERED' }),
    }));
    expect(appendDeliveryEvent).toHaveBeenCalledOnce();
    expect(notifyOrderParties).toHaveBeenCalledTimes(2);
    expect(updateReleaseEligibility).toHaveBeenCalledOnce();
    expect(lockOrderForDelivery).toHaveBeenCalledOnce();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ releaseStatus: 'NOT_ELIGIBLE' }),
    }));
  });
});
