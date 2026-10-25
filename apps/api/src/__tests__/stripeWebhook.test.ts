import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  events: new Map<string, { id: string; type: string }>(),
  orders: new Map<string, { id: string; checkoutSessionId: string; data: any }>(),
  reservations: [] as any[],
  inventory: new Map<string, { reservedQuantity: number; soldQuantity: number }>(),
  checkoutIntents: new Map<string, any>(),
  txTail: Promise.resolve() as Promise<void>,
  failInventoryOnce: false,
  eventCreateError: null as Error | null,
  reservationUpdateLimit: null as number | null,
}));

const uniqueError = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

vi.mock('../lib/prisma.js', () => {
  const prismaMock: any = {
    webhookEvent: {
      create: vi.fn(async ({ data }: any) => {
        if (harness.eventCreateError) {
          const error = harness.eventCreateError;
          harness.eventCreateError = null;
          throw error;
        }
        if (harness.events.has(data.id)) throw uniqueError();
        harness.events.set(data.id, data);
        return data;
      }),
      findUnique: vi.fn(async ({ where }: any) => harness.events.get(where.id) ?? null),
    },
    order: {
      findUnique: vi.fn(async ({ where }: any) => harness.orders.get(where.checkoutSessionId) ?? null),
      create: vi.fn(async ({ data }: any) => {
        if (harness.orders.has(data.checkoutSessionId)) throw uniqueError();
        const order = {
          id: `order-${harness.orders.size + 1}`,
          checkoutSessionId: data.checkoutSessionId,
          data,
        };
        harness.orders.set(data.checkoutSessionId, order);
        return order;
      }),
    },
    inventoryReservation: {
      findMany: vi.fn(async ({ where }: any) =>
        harness.reservations.filter(
          (reservation) =>
            (!where.status || reservation.status === where.status) &&
            where.OR.some(
              (condition: any) =>
                (condition.checkoutSessionId &&
                  reservation.checkoutSessionId === condition.checkoutSessionId) ||
                (condition.checkoutReservationGroupId &&
                  reservation.checkoutReservationGroupId === condition.checkoutReservationGroupId),
            ),
        ),
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const reservation = harness.reservations.find((row) => row.id === where.id);
        Object.assign(reservation, data);
        return reservation;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const ids: string[] = where.id?.in ?? [where.id];
        const matching = harness.reservations.filter((row) => ids.includes(row.id) && row.status === where.status);
        const updated = harness.reservationUpdateLimit === null
          ? matching
          : matching.slice(0, harness.reservationUpdateLimit);
        for (const reservation of updated) Object.assign(reservation, data);
        return { count: updated.length };
      }),
    },
    inventory: {
      update: vi.fn(async ({ where, data }: any) => {
        if (harness.failInventoryOnce) {
          harness.failInventoryOnce = false;
          throw new Error('inventory write failed');
        }
        const inventory = harness.inventory.get(where.artworkId)!;
        inventory.reservedQuantity -= data.reservedQuantity?.decrement ?? 0;
        inventory.soldQuantity += data.soldQuantity?.increment ?? 0;
        return inventory;
      }),
    },
    checkoutIntent: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        for (const intent of harness.checkoutIntents.values()) {
          if (
            where.OR?.some((condition: any) =>
              (condition.stripeSessionId && condition.stripeSessionId === 'cs_test_1') ||
              (condition.reservationGroupId && condition.reservationGroupId === 'reservation-group-1'),
            )
          ) {
            if (where.status?.in && !where.status.in.includes(intent.status)) continue;
            Object.assign(intent, data);
          }
        }
        return { count: 1 };
      }),
    },
    $transaction: vi.fn(async (operation: (tx: any) => unknown) => {
      const previous = harness.txTail;
      let release!: () => void;
      harness.txTail = new Promise<void>((resolve) => (release = resolve));
      await previous;

      const eventsBefore = new Map(harness.events);
      const ordersBefore = new Map(harness.orders);
      const reservationsBefore = structuredClone(harness.reservations);
      const inventoryBefore = new Map(
        [...harness.inventory].map(([id, row]) => [id, { ...row }]),
      );
      const intentsBefore = new Map(
        [...harness.checkoutIntents].map(([id, intent]) => [id, { ...intent }]),
      );
      try {
        return await operation(prismaMock);
      } catch (error) {
        harness.events.clear();
        for (const [id, event] of eventsBefore) harness.events.set(id, event);
        harness.orders.clear();
        for (const [id, order] of ordersBefore) harness.orders.set(id, order);
        harness.reservations = reservationsBefore;
        harness.inventory.clear();
        for (const [id, row] of inventoryBefore) harness.inventory.set(id, row);
        harness.checkoutIntents.clear();
        for (const [id, intent] of intentsBefore) harness.checkoutIntents.set(id, intent);
        throw error;
      } finally {
        release();
      }
    }),
  };
  return { prisma: prismaMock };
});

import { app } from '../app.js';
import { stripe } from '../lib/stripe.js';
import { config } from '../config/index.js';

function checkoutEvent(id: string, sessionId = 'cs_test_1') {
  return {
    id,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        payment_status: 'paid',
        payment_intent: `pi_${sessionId}`,
        currency: 'usd',
        amount_total: 12500,
        metadata: {
          userId: 'buyer-1',
          commissionRateBps: '1000',
          reservationGroupId: 'reservation-group-1',
        },
        customer_details: null,
        shipping_details: null,
      },
    },
  } as any;
}

async function deliver(event: any, signature = 'valid-signature') {
  const payload = JSON.stringify(event);
  const signedHeader = signature === 'valid-signature'
    ? stripe.webhooks.generateTestHeaderString({ payload, secret: config.stripeWebhookSecret })
    : signature;
  return request(app)
    .post('/api/v1/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', signedHeader)
    .send(payload);
}

beforeEach(() => {
  harness.events.clear();
  harness.orders.clear();
  harness.inventory.clear();
  harness.checkoutIntents.clear();
  harness.reservations = [
    {
      id: 'reservation-1',
      artworkId: 'artwork-1',
      userId: 'buyer-1',
      checkoutSessionId: 'cs_test_1',
      checkoutReservationGroupId: 'reservation-group-1',
      status: 'ACTIVE',
      quantity: 1,
      artwork: {
        id: 'artwork-1',
        title: 'Blue Study',
        price: 125,
        currency: 'USD',
        artistId: 'artist-1',
        artist: { displayName: 'Artist One' },
      },
    },
  ];
  harness.inventory.set('artwork-1', { reservedQuantity: 1, soldQuantity: 0 });
  harness.txTail = Promise.resolve();
  harness.failInventoryOnce = false;
  harness.eventCreateError = null;
  harness.reservationUpdateLimit = null;
  harness.reservations[0].checkoutIntentId = 'intent-1';
});

describe('Stripe webhook fulfillment', () => {
  it('verifies the original raw request body before creating financial records', async () => {
    const event = { id: 'evt_1', type: 'customer.updated', data: { object: {} } } as any;
    const response = await deliver(event);

    expect(response.status).toBe(200);
    // The real Stripe SDK accepted the signature generated over these bytes,
    // which also exercises the application's raw-body middleware ordering.
    expect(harness.events.has(event.id)).toBe(true);
    expect(harness.orders.size).toBe(0);
  });

  it('rejects an invalid signature without writing event, order, payment, or inventory data', async () => {
    const response = await request(app)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'invalid-signature')
      .send('{"id":"evt_invalid"}');

    expect(response.status).toBe(400);
    expect(harness.events.size).toBe(0);
    expect(harness.orders.size).toBe(0);
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 1, soldQuantity: 0 });
  });

  it('fulfills a paid checkout once and stores order, payment, and inventory changes together', async () => {
    harness.checkoutIntents.set('intent-1', {
      status: 'OPEN',
      stripeSessionId: 'cs_test_1',
      reservationGroupId: 'reservation-group-1',
    });
    const response = await deliver(checkoutEvent('evt_paid'));

    expect(response.status).toBe(200);
    expect(harness.events.size).toBe(1);
    expect(harness.orders.size).toBe(1);
    const order = harness.orders.get('cs_test_1')!;
    expect(order.data.checkoutSessionId).toBe('cs_test_1');
    expect(order.data.status).toBe('CONFIRMED');
    expect(order.data.items.create[0]).toMatchObject({
      subtotal: '125.00',
      commissionRate: '0.1000',
      commissionAmount: '12.50',
      currency: 'USD',
    });
    expect(order.data.payments.create).toMatchObject({
      providerPaymentId: 'pi_cs_test_1',
      amount: '125.00',
      currency: 'USD',
      status: 'SUCCEEDED',
    });
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 0, soldQuantity: 1 });
    expect(harness.checkoutIntents.get('intent-1')?.status).toBe('PAID');
    expect(harness.reservations[0]).toMatchObject({ status: 'CONVERTED', orderId: 'order-1' });

    await deliver({
      id: 'evt_late_expiration',
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_test_1', metadata: { reservationGroupId: 'reservation-group-1' } } },
    });
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 0, soldQuantity: 1 });
    expect(harness.reservations[0].status).toBe('CONVERTED');
  });

  it('recovers reservations by their durable group when session linking was not persisted', async () => {
    harness.reservations[0].checkoutSessionId = null;
    const response = await deliver(checkoutEvent('evt_recover_link'));

    expect(response.status).toBe(200);
    expect(harness.orders.size).toBe(1);
    expect(harness.reservations[0]).toMatchObject({
      status: 'CONVERTED',
      checkoutSessionId: 'cs_test_1',
    });
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 0, soldQuantity: 1 });
  });

  it('acknowledges duplicate deliveries of the same event without repeating fulfillment', async () => {
    const event = checkoutEvent('evt_repeat');
    await deliver(event);
    const repeated = await deliver(event);

    expect(repeated.status).toBe(200);
    expect(repeated.body.duplicate).toBe(true);
    expect(harness.orders.size).toBe(1);
    expect(harness.events.size).toBe(1);
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 0, soldQuantity: 1 });
  });

  it('does not fulfill one checkout twice when different event IDs refer to it', async () => {
    const [first, second] = await Promise.all([
      deliver(checkoutEvent('evt_first')),
      deliver(checkoutEvent('evt_second')),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(harness.events.size).toBe(2);
    expect(harness.orders.size).toBe(1);
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 0, soldQuantity: 1 });
  });

  it('converts every item in a reservation group and mutates counters once across duplicate events', async () => {
    harness.reservations.push({
      ...harness.reservations[0],
      id: 'reservation-2',
      artworkId: 'artwork-2',
      quantity: 2,
      artwork: { ...harness.reservations[0].artwork, id: 'artwork-2' },
    });
    harness.inventory.set('artwork-2', { reservedQuantity: 2, soldQuantity: 0 });
    const event = checkoutEvent('evt_multi_item');
    event.data.object.amount_total = 37500;

    const first = await deliver(event);
    const duplicate = await deliver({ ...event, id: 'evt_multi_item_again' });

    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(harness.reservations.map((reservation) => reservation.status)).toEqual(['CONVERTED', 'CONVERTED']);
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 0, soldQuantity: 1 });
    expect(harness.inventory.get('artwork-2')).toEqual({ reservedQuantity: 0, soldQuantity: 2 });
    expect(harness.orders.size).toBe(1);
    const itemSnapshots = harness.orders.get('cs_test_1')!.data.items.create;
    expect(itemSnapshots.map((item: any) => item.commissionAmount)).toEqual(['12.50', '25.00']);
    expect(itemSnapshots.reduce((sum: number, item: any) => sum + Number(item.commissionAmount), 0)).toBe(37.5);
  });

  it('rounds order commission half-up and preserves the captured legacy 15% rate', async () => {
    harness.reservations[0].artwork.price = '0.05';
    const tiny = checkoutEvent('evt_tiny');
    tiny.data.object.amount_total = 5;
    const rounded = await deliver(tiny);
    expect(rounded.status).toBe(200);
    expect(harness.orders.get('cs_test_1')!.data.items.create[0]).toMatchObject({
      subtotal: '0.05',
      commissionRate: '0.1000',
      commissionAmount: '0.01',
    });

    harness.events.clear();
    harness.orders.clear();
    harness.reservations[0].status = 'ACTIVE';
    harness.reservations[0].orderId = null;
    harness.reservations[0].artwork.price = 125;
    harness.inventory.set('artwork-1', { reservedQuantity: 1, soldQuantity: 0 });
    const legacy = checkoutEvent('evt_legacy_15');
    legacy.data.object.amount_total = 12500;
    legacy.data.object.metadata.commissionRateBps = undefined;
    legacy.data.object.metadata.commissionRate = '0.15';
    const legacyResult = await deliver(legacy);
    expect(legacyResult.status).toBe(200);
    expect(harness.orders.get('cs_test_1')!.data.items.create[0]).toMatchObject({
      commissionRate: '0.15',
      commissionAmount: '18.75',
    });
  });

  it('fulfills a signed legacy session with a two-decimal currency and exact captured rate', async () => {
    harness.reservations[0].artwork.price = '12.34';
    harness.reservations[0].artwork.currency = 'SEK';
    const legacy = checkoutEvent('evt_legacy_sek');
    legacy.data.object.currency = 'sek';
    legacy.data.object.amount_total = 1234;
    legacy.data.object.metadata.commissionRateBps = undefined;
    legacy.data.object.metadata.commissionRate = '0.12345';

    const response = await deliver(legacy);

    expect(response.status).toBe(200);
    expect(harness.orders.get('cs_test_1')!.data).toMatchObject({
      currency: 'SEK',
      totalAmount: '12.34',
      items: {
        create: [{
          currency: 'SEK',
          commissionRate: '0.12345',
          commissionAmount: '1.52',
        }],
      },
      payments: {
        create: { currency: 'SEK', amount: '12.34' },
      },
    });
  });

  it('fulfills and deduplicates a signed zero-decimal legacy checkout', async () => {
    harness.reservations[0].artwork.price = '500.00';
    harness.reservations[0].artwork.currency = 'XAF';
    const legacy = checkoutEvent('evt_legacy_xaf');
    legacy.data.object.currency = 'xaf';
    legacy.data.object.amount_total = 500;
    legacy.data.object.metadata.commissionRateBps = undefined;
    legacy.data.object.metadata.commissionRate = '0.15';

    const first = await deliver(legacy);
    const duplicate = await deliver(legacy);

    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);
    expect(harness.orders.size).toBe(1);
    expect(harness.orders.get('cs_test_1')!.data).toMatchObject({
      currency: 'XAF',
      totalAmount: '500',
      items: { create: [{ commissionAmount: '75', currency: 'XAF' }] },
      payments: { create: { currency: 'XAF', amount: '500' } },
    });
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 0, soldQuantity: 1 });
  });

  it('keeps the historical per-item rounding rule for legacy commission snapshots', async () => {
    harness.reservations[0].artwork.price = '0.05';
    harness.reservations.push({
      ...harness.reservations[0],
      id: 'reservation-2',
      artworkId: 'artwork-2',
      artwork: { ...harness.reservations[0].artwork, id: 'artwork-2' },
    });
    harness.inventory.set('artwork-2', { reservedQuantity: 1, soldQuantity: 0 });
    const legacy = checkoutEvent('evt_legacy_per_item_rounding');
    legacy.data.object.amount_total = 10;
    legacy.data.object.metadata.commissionRateBps = undefined;
    legacy.data.object.metadata.commissionRate = '0.10';

    const response = await deliver(legacy);

    expect(response.status).toBe(200);
    expect(harness.orders.get('cs_test_1')!.data.items.create.map((item: any) => item.commissionAmount))
      .toEqual(['0.01', '0.01']);
  });

  it('rejects invalid legacy rates and invalid fixed-rate metadata without fulfillment', async () => {
    const event = checkoutEvent('evt_invalid_rate');
    event.data.object.metadata.commissionRate = '1.0001';
    event.data.object.metadata.commissionRateBps = undefined;

    const legacyResponse = await deliver(event);
    expect(legacyResponse.status).toBe(500);
    expect(harness.orders.size).toBe(0);
    expect(harness.events.size).toBe(0);

    const fixedEvent = checkoutEvent('evt_invalid_fixed_rate');
    fixedEvent.data.object.metadata.commissionRate = '0.15';
    fixedEvent.data.object.metadata.commissionRateBps = '1001';
    const fixedResponse = await deliver(fixedEvent);

    expect(fixedResponse.status).toBe(500);
    expect(harness.orders.size).toBe(0);
    expect(harness.events.size).toBe(0);
  });

  it('rejects a legacy amount mismatch and unknown currency without recording payment', async () => {
    const mismatch = checkoutEvent('evt_legacy_mismatch');
    mismatch.data.object.metadata.commissionRateBps = undefined;
    mismatch.data.object.metadata.commissionRate = '0.15';
    mismatch.data.object.amount_total = 12499;
    const mismatchResponse = await deliver(mismatch);
    expect(mismatchResponse.status).toBe(500);
    expect(harness.orders.size).toBe(0);

    const unsupported = checkoutEvent('evt_legacy_unknown_currency');
    unsupported.data.object.metadata.commissionRateBps = undefined;
    unsupported.data.object.metadata.commissionRate = '0.15';
    unsupported.data.object.currency = 'xyz';
    harness.reservations[0].artwork.currency = 'XYZ';
    const unsupportedResponse = await deliver(unsupported);
    expect(unsupportedResponse.status).toBe(500);
    expect(harness.orders.size).toBe(0);
  });

  it('returns a retryable failure and rolls back the event receipt when fulfillment fails', async () => {
    harness.failInventoryOnce = true;
    const event = checkoutEvent('evt_retry');
    const first = await deliver(event);

    expect(first.status).toBe(500);
    expect(harness.events.size).toBe(0);
    expect(harness.orders.size).toBe(0);
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 1, soldQuantity: 0 });

    const retry = await deliver(event);
    expect(retry.status).toBe(200);
    expect(harness.events.size).toBe(1);
    expect(harness.orders.size).toBe(1);
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 0, soldQuantity: 1 });
  });

  it('does not mistake an event-storage failure for an already processed event', async () => {
    harness.eventCreateError = new Error('database unavailable');
    const response = await deliver(checkoutEvent('evt_db_error'));

    expect(response.status).toBe(500);
    expect(harness.events.size).toBe(0);
    expect(harness.orders.size).toBe(0);
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 1, soldQuantity: 0 });
  });

  it('serializes concurrent duplicate deliveries and only mutates inventory once', async () => {
    const event = checkoutEvent('evt_concurrent');
    const [first, second] = await Promise.all([deliver(event), deliver(event)]);

    expect([first.status, second.status].sort()).toEqual([200, 200]);
    expect(harness.events.size).toBe(1);
    expect(harness.orders.size).toBe(1);
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 0, soldQuantity: 1 });
  });

  it('rejects a signed event whose amount does not match the reserved items', async () => {
    const event = checkoutEvent('evt_wrong_amount');
    event.data.object.amount_total = 1;
    const response = await deliver(event);

    expect(response.status).toBe(500);
    expect(harness.events.size).toBe(0);
    expect(harness.orders.size).toBe(0);
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 1, soldQuantity: 0 });
  });

  it('releases reservations only after a signed Checkout Session expiration event', async () => {
    const response = await deliver({
      id: 'evt_expired',
      type: 'checkout.session.expired',
      data: { object: {
        id: 'cs_test_1',
        metadata: { reservationGroupId: 'reservation-group-1' },
      } },
    });

    expect(response.status).toBe(200);
    expect(harness.reservations[0].status).toBe('EXPIRED');
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 0, soldQuantity: 0 });
    expect(harness.events.has('evt_expired')).toBe(true);

    const paidAfterExpiration = await deliver(checkoutEvent('evt_paid_after_expiration'));
    expect(paidAfterExpiration.status).toBe(500);
    expect(harness.orders.size).toBe(0);
    expect(harness.events.has('evt_paid_after_expiration')).toBe(false);
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 0, soldQuantity: 0 });
    expect(harness.reservations[0].status).toBe('EXPIRED');
  });

  it('rolls back the whole fulfillment when only part of a multi-item group can be claimed', async () => {
    harness.reservations.push({
      ...harness.reservations[0],
      id: 'reservation-2',
      artworkId: 'artwork-2',
      quantity: 2,
      artwork: { ...harness.reservations[0].artwork, id: 'artwork-2', price: 125 },
    });
    harness.inventory.set('artwork-2', { reservedQuantity: 2, soldQuantity: 0 });
    harness.reservationUpdateLimit = 1;
    const event = checkoutEvent('evt_partial_claim');
    event.data.object.amount_total = 37500;

    const response = await deliver(event);

    expect(response.status).toBe(500);
    expect(harness.events.has('evt_partial_claim')).toBe(false);
    expect(harness.orders.size).toBe(0);
    expect(harness.reservations.map((reservation) => reservation.status)).toEqual(['ACTIVE', 'ACTIVE']);
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 1, soldQuantity: 0 });
    expect(harness.inventory.get('artwork-2')).toEqual({ reservedQuantity: 2, soldQuantity: 0 });
  });

  it('does not partially release a multi-item reservation group', async () => {
    harness.reservations.push({
      ...harness.reservations[0],
      id: 'reservation-2',
      artworkId: 'artwork-2',
      quantity: 2,
      checkoutSessionId: 'cs_test_1',
      artwork: { ...harness.reservations[0].artwork, id: 'artwork-2' },
    });
    harness.inventory.set('artwork-2', { reservedQuantity: 2, soldQuantity: 0 });
    harness.reservationUpdateLimit = 1;

    const response = await deliver({
      id: 'evt_partial_expiration',
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_test_1', metadata: { reservationGroupId: 'reservation-group-1' } } },
    });

    expect(response.status).toBe(500);
    expect(harness.events.has('evt_partial_expiration')).toBe(false);
    expect(harness.reservations.map((reservation) => reservation.status)).toEqual(['ACTIVE', 'ACTIVE']);
    expect(harness.inventory.get('artwork-1')).toEqual({ reservedQuantity: 1, soldQuantity: 0 });
    expect(harness.inventory.get('artwork-2')).toEqual({ reservedQuantity: 2, soldQuantity: 0 });
  });
});
