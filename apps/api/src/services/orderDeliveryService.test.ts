import { beforeEach, describe, expect, it, vi } from 'vitest';

const sideEffects = vi.hoisted(() => ({
  notifications: [] as Array<{ type: string; userId: string }>,
  audits: [] as unknown[],
}));

vi.mock('./notificationService.js', () => ({
  createNotification: vi.fn(async (_tx, input) => {
    sideEffects.notifications.push({ type: input.type, userId: input.userId });
  }),
}));

vi.mock('./auditService.js', () => ({
  recordAudit: vi.fn(async (_tx, input) => {
    sideEffects.audits.push(input);
  }),
}));

import { updateReleaseEligibility } from './orderDeliveryService.js';

function setup(input: {
  buyerReceivedGoodAt?: Date | null;
  artistResponseDeadline?: Date | null;
  artistResponseWindowExpiredAt?: Date | null;
  releaseStatus?: 'NOT_ELIGIBLE' | 'ELIGIBLE' | 'BLOCKED';
  releaseHoldAt?: Date | null;
  artistConfirmed?: boolean[];
  hasOpenDispute?: boolean;
}) {
  const order = {
    id: 'order-1',
    userId: 'buyer-1',
    buyerReceivedGoodAt: input.buyerReceivedGoodAt ?? null,
    artistResponseDeadline: input.artistResponseDeadline ?? null,
    artistResponseWindowExpiredAt: input.artistResponseWindowExpiredAt ?? null,
    releaseEligibleAt: null as Date | null,
    releaseHoldAt: input.releaseHoldAt ?? null,
    releaseStatus: input.releaseStatus ?? 'NOT_ELIGIBLE',
    artistFulfillments: (input.artistConfirmed ?? [false]).map((confirmed, index) => ({
      artistCompletionConfirmedAt: confirmed ? new Date('2026-01-01T00:00:00.000Z') : null,
      artist: { userId: `artist-user-${index}` },
    })),
    deliveryDisputes: input.hasOpenDispute ? [{ id: 'dispute-1' }] : [],
  };
  const events: Array<{ eventType: string }> = [];
  const tx = {
    $queryRaw: vi.fn(async () => []),
    order: {
      findUnique: vi.fn(async () => order),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if ('artistResponseWindowExpiredAt' in where) {
          if (order.artistResponseWindowExpiredAt !== null) return { count: 0 };
          order.artistResponseWindowExpiredAt = data.artistResponseWindowExpiredAt;
          return { count: 1 };
        }
        if (order.releaseStatus !== where.releaseStatus) return { count: 0 };
        order.releaseStatus = data.releaseStatus;
        order.releaseEligibleAt = data.releaseEligibleAt;
        return { count: 1 };
      }),
    },
    orderDeliveryEvent: {
      create: vi.fn(async ({ data }: any) => {
        events.push({ eventType: data.eventType });
        return data;
      }),
    },
  } as any;

  return { tx, order, events };
}

describe('order delivery release eligibility', () => {
  const now = new Date('2026-10-25T12:00:00.000Z');
  const deadline = new Date(now.getTime() - 1);
  const receivedAt = new Date('2026-10-23T12:00:00.000Z');

  beforeEach(() => {
    sideEffects.notifications.length = 0;
    sideEffects.audits.length = 0;
  });

  it('does not let artist confirmation alone authorize release', async () => {
    const { tx, order } = setup({ artistConfirmed: [true] });

    await expect(updateReleaseEligibility(tx, order.id, now)).resolves.toBe('unchanged');

    expect(order.releaseStatus).toBe('NOT_ELIGIBLE');
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('makes release eligible immediately after buyer and all artists confirm', async () => {
    const { tx, order, events } = setup({
      buyerReceivedGoodAt: receivedAt,
      artistResponseDeadline: new Date(now.getTime() + 48 * 60 * 60 * 1_000),
      artistConfirmed: [true, true],
    });

    await expect(updateReleaseEligibility(tx, order.id, now)).resolves.toBe('eligible');

    expect(order.releaseStatus).toBe('ELIGIBLE');
    expect(order.releaseEligibleAt).toEqual(now);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(events.map((event) => event.eventType)).toEqual(['RELEASE_ELIGIBLE']);
  });

  it('keeps buyer-only confirmation ineligible until the persisted 48-hour deadline', async () => {
    const { tx, order, events } = setup({
      buyerReceivedGoodAt: receivedAt,
      artistResponseDeadline: new Date(now.getTime() + 1),
      artistConfirmed: [false],
    });

    await expect(updateReleaseEligibility(tx, order.id, now)).resolves.toBe('unchanged');
    expect(order.releaseStatus).toBe('NOT_ELIGIBLE');
    expect(events).toHaveLength(0);
  });

  it('makes buyer-only confirmation eligible after deadline and records expiry once', async () => {
    const { tx, order, events } = setup({
      buyerReceivedGoodAt: receivedAt,
      artistResponseDeadline: deadline,
      artistConfirmed: [false],
    });

    await expect(updateReleaseEligibility(tx, order.id, now)).resolves.toBe('eligible');
    await expect(updateReleaseEligibility(tx, order.id, now)).resolves.toBe('unchanged');

    expect(order.artistResponseWindowExpiredAt).toEqual(now);
    expect(order.releaseStatus).toBe('ELIGIBLE');
    expect(events.map((event) => event.eventType)).toEqual([
      'ARTIST_RESPONSE_WINDOW_EXPIRED',
      'RELEASE_ELIGIBLE',
    ]);
    expect(sideEffects.notifications.filter((item) => item.type === 'ARTIST_RESPONSE_WINDOW_EXPIRED')).toHaveLength(2);
  });

  it.each([
    ['an open delivery dispute', { hasOpenDispute: true }],
    ['a payment hold', { releaseHoldAt: new Date('2026-10-24T00:00:00.000Z') }],
  ])('blocks eligibility when there is %s', async (_description, blocker) => {
    const { tx, order, events } = setup({
      buyerReceivedGoodAt: receivedAt,
      artistResponseDeadline: deadline,
      artistConfirmed: [false],
      ...blocker,
    });

    await expect(updateReleaseEligibility(tx, order.id, now)).resolves.toBe('blocked');

    expect(order.releaseStatus).toBe('BLOCKED');
    expect(order.releaseEligibleAt).toBeNull();
    expect(events.map((event) => event.eventType)).toContain('RELEASE_BLOCKED');
  });
});
