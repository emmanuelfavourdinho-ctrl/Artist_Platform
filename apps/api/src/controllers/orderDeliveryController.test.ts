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

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
vi.mock('../services/auditService.js', () => audit);

import {
  confirmBuyerReceipt,
  getArtistOrderFulfillment,
  getBuyerOrderDelivery,
  respondToArtistDeliveryDispute,
} from './orderDeliveryController.js';
import { prisma } from '../lib/prisma.js';
import {
  appendDeliveryEvent,
  lockOrderForDelivery,
  notifyOrderParties,
  updateReleaseEligibility,
} from '../services/orderDeliveryService.js';
import { recordAudit } from '../services/auditService.js';

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

  it('records an authorized artist dispute response without resolving the dispute or enabling release', async () => {
    const dispute = {
      id: '44444444-4444-4444-8444-444444444444',
      orderId: ORDER_ID,
      status: 'OPEN',
      artistResponse: null,
      artistEvidenceReferences: [],
      artistRespondedAt: null,
    };
    const tx = {
      artistProfile: { findUnique: vi.fn().mockResolvedValue({ id: ARTIST_ID }) },
      deliveryDispute: {
        findUnique: vi.fn().mockResolvedValue({ id: dispute.id, orderId: ORDER_ID }),
        findFirst: vi.fn().mockResolvedValue(dispute),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();

    await respondToArtistDeliveryDispute({
      params: { disputeId: dispute.id },
      user: { id: BUYER_ID },
      body: { response: 'The parcel was shipped with the listed carrier.', evidenceReferences: ['proof-ref'] },
    } as never, { status, json } as never);

    expect(lockOrderForDelivery).toHaveBeenCalledWith(tx, ORDER_ID);
    expect(tx.deliveryDispute.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: dispute.id, orderId: ORDER_ID, order: { items: { some: { artistId: ARTIST_ID } } } },
    }));
    expect(tx.deliveryDispute.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: dispute.id, status: 'OPEN', artistRespondedAt: null },
      data: expect.objectContaining({
        artistResponse: 'The parcel was shipped with the listed carrier.',
        artistEvidenceReferences: ['proof-ref'],
      }),
    }));
    expect(appendDeliveryEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventType: 'ARTIST_DISPUTE_RESPONSE_SUBMITTED',
    }));
    expect(recordAudit).toHaveBeenCalledOnce();
    expect(notifyOrderParties).toHaveBeenCalledOnce();
    expect(updateReleaseEligibility).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ duplicate: false }),
    }));
  });

  it('returns a duplicate response idempotently without another event', async () => {
    const respondedAt = new Date('2026-10-26T00:00:00.000Z');
    const tx = {
      artistProfile: { findUnique: vi.fn().mockResolvedValue({ id: ARTIST_ID }) },
      deliveryDispute: {
        findUnique: vi.fn().mockResolvedValue({ id: '44444444-4444-4444-8444-444444444444', orderId: ORDER_ID }),
        findFirst: vi.fn().mockResolvedValue({
          id: '44444444-4444-4444-8444-444444444444',
          orderId: ORDER_ID,
          status: 'OPEN',
          artistResponse: 'The parcel was shipped with the listed carrier.',
          artistEvidenceReferences: ['proof-ref'],
          artistRespondedAt: respondedAt,
        }),
        updateMany: vi.fn(),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();

    await respondToArtistDeliveryDispute({
      params: { disputeId: '44444444-4444-4444-8444-444444444444' },
      user: { id: BUYER_ID },
      body: { response: 'The parcel was shipped with the listed carrier.', evidenceReferences: ['proof-ref'] },
    } as never, { status, json } as never);

    expect(tx.deliveryDispute.updateMany).not.toHaveBeenCalled();
    expect(appendDeliveryEvent).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: 'success',
      data: { id: '44444444-4444-4444-8444-444444444444', respondedAt, duplicate: true },
    });
  });
});
