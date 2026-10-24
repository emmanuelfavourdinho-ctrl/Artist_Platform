import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  intent: null as any,
  reservations: [] as any[],
  inventory: { reservedQuantity: 2, soldQuantity: 0 },
  reservationUpdateLimit: null as number | null,
  create: vi.fn(),
  retrieve: vi.fn(),
  expire: vi.fn(),
  tail: Promise.resolve() as Promise<void>,
}));

vi.mock('../lib/prisma.js', () => {
  const db: any = {
    checkoutIntent: {
      findMany: vi.fn(async () => harness.intent ? [harness.intent] : []),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (!harness.intent || harness.intent.id !== where.id) return { count: 0 };
        const conditions = where.OR ?? [];
        if (conditions.length && !conditions.some((condition: any) => {
          if (condition.status !== harness.intent.status) return false;
          if (condition.creationLeaseUntil?.lte && harness.intent.creationLeaseUntil > condition.creationLeaseUntil.lte) return false;
          return true;
        })) return { count: 0 };
        if (where.status && typeof where.status === 'string' && where.status !== harness.intent.status) return { count: 0 };
        if (where.status?.in && !where.status.in.includes(harness.intent.status)) return { count: 0 };
        if (where.creationLeaseToken !== undefined && where.creationLeaseToken !== harness.intent.creationLeaseToken) return { count: 0 };
        if (where.creationLeaseUntil?.gt && !(harness.intent.creationLeaseUntil > where.creationLeaseUntil.gt)) return { count: 0 };
        Object.assign(harness.intent, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }: any) => Object.assign(harness.intent, data)),
    },
    inventoryReservation: {
      findMany: vi.fn(async ({ where }: any) => harness.reservations.filter((row) =>
        (!where.checkoutIntentId || row.checkoutIntentId === where.checkoutIntentId) &&
        (!where.status || row.status === where.status),
      )),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const ids: string[] = where.id?.in ?? [where.id];
        const matching = harness.reservations.filter((row) => ids.includes(row.id) && row.status === where.status);
        const updated = harness.reservationUpdateLimit === null ? matching : matching.slice(0, harness.reservationUpdateLimit);
        for (const row of updated) Object.assign(row, data);
        return { count: updated.length };
      }),
      update: vi.fn(),
    },
    inventory: {
      update: vi.fn(async ({ data }: any) => {
        harness.inventory.reservedQuantity -= data.reservedQuantity.decrement;
        return harness.inventory;
      }),
    },
    $transaction: vi.fn(async (fn: (tx: any) => unknown) => {
      const previous = harness.tail;
      let release!: () => void;
      harness.tail = new Promise<void>((resolve) => (release = resolve));
      await previous;
      const beforeIntent = harness.intent ? { ...harness.intent } : null;
      const beforeReservations = structuredClone(harness.reservations);
      const beforeInventory = { ...harness.inventory };
      try {
        return await fn(db);
      } catch (error) {
        harness.intent = beforeIntent;
        harness.reservations = beforeReservations;
        harness.inventory = beforeInventory;
        throw error;
      } finally { release(); }
    }),
  };
  return { prisma: db };
});

vi.mock('../lib/stripe.js', () => ({
  stripe: { checkout: { sessions: {
    create: harness.create,
    retrieve: harness.retrieve,
    expire: harness.expire,
  } } },
}));

import { reconcileCheckoutIntents } from '../services/checkoutReconciliationService.js';

const NOW = new Date('2026-10-24T12:00:00.000Z');

function intent(status: string, ageHours = 1) {
  return {
    id: 'intent-1',
    creationLeaseToken: null,
    userId: 'buyer-1',
    idempotencyKey: 'stable-key',
    reservationGroupId: 'stable-provider-key',
    providerRequest: { mode: 'payment', line_items: [] },
    status,
    stripeSessionId: status === 'OPEN' ? 'cs_known' : null,
    checkoutUrl: status === 'OPEN' ? 'https://checkout.test' : null,
    createdAt: new Date(NOW.getTime() - ageHours * 60 * 60 * 1000),
    updatedAt: new Date(NOW.getTime() - 10 * 60 * 1000),
    creationLeaseUntil: null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  harness.intent = intent('OPEN');
  harness.reservations = [{ id: 'reservation-1', checkoutIntentId: 'intent-1', artworkId: 'art-1', quantity: 2, status: 'ACTIVE' }];
  harness.inventory = { reservedQuantity: 2, soldQuantity: 0 };
  harness.reservationUpdateLimit = null;
  harness.tail = Promise.resolve();
  harness.create.mockReset();
  harness.retrieve.mockReset();
  harness.expire.mockReset();
});

afterEach(() => vi.useRealTimers());

describe('checkout intent reconciliation', () => {
  it('releases inventory only after provider confirms a session is expired', async () => {
    harness.retrieve.mockResolvedValue({ id: 'cs_known', status: 'open', expires_at: Math.floor(NOW.getTime() / 1000) - 1 });
    harness.expire.mockResolvedValue({ id: 'cs_known', status: 'expired' });

    const result = await reconcileCheckoutIntents({ now: NOW });
    expect(result.released).toBe(1);
    expect(harness.intent.status).toBe('EXPIRED');
    expect(harness.reservations[0].status).toBe('EXPIRED');
    expect(harness.inventory.reservedQuantity).toBe(0);

    await reconcileCheckoutIntents({ now: NOW });
    expect(harness.inventory.reservedQuantity).toBe(0);
  });

  it('keeps inventory protected while the provider session remains open', async () => {
    harness.retrieve.mockResolvedValue({ id: 'cs_known', status: 'open', expires_at: Math.floor(NOW.getTime() / 1000) + 3600 });

    const result = await reconcileCheckoutIntents({ now: NOW });
    expect(result.protected).toBe(1);
    expect(harness.expire).not.toHaveBeenCalled();
    expect(harness.intent.status).toBe('OPEN');
    expect(harness.inventory.reservedQuantity).toBe(2);
  });

  it('records transient provider failures and retries the still-protected session later', async () => {
    harness.retrieve.mockRejectedValueOnce(new Error('provider temporarily unavailable'));
    const first = await reconcileCheckoutIntents({ now: NOW });

    expect(first.failed).toBe(1);
    expect(harness.intent.status).toBe('OPEN');
    expect(harness.intent.lastError).toMatch(/temporarily unavailable/);
    expect(harness.inventory.reservedQuantity).toBe(2);

    harness.retrieve.mockResolvedValueOnce({ id: 'cs_known', status: 'open', expires_at: Math.floor(NOW.getTime() / 1000) + 3600 });
    const retry = await reconcileCheckoutIntents({ now: new Date(NOW.getTime() + 3 * 60 * 1000) });
    expect(retry.protected).toBe(1);
    expect(harness.intent.lastError).toBeNull();
    expect(harness.inventory.reservedQuantity).toBe(2);
  });

  it('replays a recent ambiguous create from persisted parameters and provider key', async () => {
    harness.intent = intent('UNKNOWN');
    harness.create.mockResolvedValue({ id: 'cs_recovered', url: 'https://checkout.test/recovered', expires_at: Math.floor(NOW.getTime() / 1000) + 3600 });
    const result = await reconcileCheckoutIntents({ now: NOW });

    expect(result.recovered).toBe(1);
    expect(harness.create).toHaveBeenCalledWith(harness.intent.providerRequest, { idempotencyKey: 'stable-provider-key' });
    expect(harness.intent.status).toBe('OPEN');
    expect(harness.intent.stripeSessionId).toBe('cs_recovered');
    expect(harness.inventory.reservedQuantity).toBe(2);
  });

  it('protects unresolved old outcomes beyond the provider idempotency replay window', async () => {
    harness.intent = intent('UNKNOWN', 25);
    const result = await reconcileCheckoutIntents({ now: NOW });

    expect(result.protected).toBe(1);
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.intent.status).toBe('RECONCILIATION_REQUIRED');
    expect(harness.intent.lastError).toMatch(/replay window/i);
    expect(harness.inventory.reservedQuantity).toBe(2);
  });

  it('does not release inventory twice when reconciliation runs concurrently', async () => {
    harness.retrieve.mockResolvedValue({ id: 'cs_known', status: 'open', expires_at: Math.floor(NOW.getTime() / 1000) - 1 });
    harness.expire.mockResolvedValue({ id: 'cs_known', status: 'expired' });

    await Promise.all([
      reconcileCheckoutIntents({ now: NOW }),
      reconcileCheckoutIntents({ now: NOW }),
    ]);
    expect(harness.inventory.reservedQuantity).toBe(0);
    expect(harness.reservations[0].status).toBe('EXPIRED');
  });

  it('does not release a reservation group that fulfillment already converted', async () => {
    harness.reservations[0].status = 'CONVERTED';
    harness.inventory.reservedQuantity = 0;
    harness.inventory.soldQuantity = 2;
    harness.retrieve.mockResolvedValue({ id: 'cs_known', status: 'expired', expires_at: Math.floor(NOW.getTime() / 1000) - 1 });

    const result = await reconcileCheckoutIntents({ now: NOW });

    expect(result.protected).toBe(1);
    expect(result.released).toBe(0);
    expect(harness.inventory).toEqual({ reservedQuantity: 0, soldQuantity: 2 });
    expect(harness.reservations[0].status).toBe('CONVERTED');
  });

  it('rolls back a partial multi-item release claim', async () => {
    harness.reservations.push({
      id: 'reservation-2',
      checkoutIntentId: 'intent-1',
      artworkId: 'art-2',
      quantity: 3,
      status: 'ACTIVE',
    });
    harness.reservationUpdateLimit = 1;
    harness.retrieve.mockResolvedValue({ id: 'cs_known', status: 'expired', expires_at: Math.floor(NOW.getTime() / 1000) - 1 });

    const result = await reconcileCheckoutIntents({ now: NOW });

    expect(result.failed).toBe(1);
    expect(harness.reservations.map((reservation) => reservation.status)).toEqual(['ACTIVE', 'ACTIVE']);
    expect(harness.inventory.reservedQuantity).toBe(2);
  });
});
