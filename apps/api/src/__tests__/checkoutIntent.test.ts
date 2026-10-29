import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  intents: new Map<string, any>(),
  reservations: [] as any[],
  inventory: { quantity: 4, reservedQuantity: 0, soldQuantity: 0, version: 1 },
  artworkCurrency: 'USD',
  stripeCreate: vi.fn(),
  txTail: Promise.resolve() as Promise<void>,
}));

const uniqueError = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

vi.mock('../lib/prisma.js', () => {
  const prismaMock: any = {
    checkoutIntent: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id) return [...harness.intents.values()].find((intent) => intent.id === where.id) ?? null;
        return harness.intents.get(`${where.userId_idempotencyKey.userId}:${where.userId_idempotencyKey.idempotencyKey}`) ?? null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const key = `${data.userId}:${data.idempotencyKey}`;
        if (harness.intents.has(key)) throw uniqueError();
        const intent = { ...data, creationLeaseToken: null, createdAt: new Date(), status: 'READY' };
        harness.intents.set(key, intent);
        return intent;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const intent = [...harness.intents.values()].find((row) => row.id === where.id)!;
        Object.assign(intent, data);
        return intent;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const intent = [...harness.intents.values()].find((row) => row.id === where.id);
        if (!intent) return { count: 0 };
        const allowed = where.OR?.some((condition: any) => {
          if (condition.status !== intent.status) return false;
          if (condition.creationLeaseUntil?.lt && !(intent.creationLeaseUntil < condition.creationLeaseUntil.lt)) return false;
          if (condition.creationLeaseUntil?.lte && !(intent.creationLeaseUntil <= condition.creationLeaseUntil.lte)) return false;
          return true;
        });
        if (where.OR && !allowed) return { count: 0 };
        if (where.status && typeof where.status === 'string' && where.status !== intent.status) return { count: 0 };
        if (where.status?.in && !where.status.in.includes(intent.status)) return { count: 0 };
        if (where.creationLeaseToken !== undefined && intent.creationLeaseToken !== where.creationLeaseToken) return { count: 0 };
        if (where.creationLeaseUntil?.gt && !(intent.creationLeaseUntil > where.creationLeaseUntil.gt)) return { count: 0 };
        Object.assign(intent, data);
        return { count: 1 };
      }),
    },
    artwork: {
      findMany: vi.fn(async ({ where }: any) => where.id.in.map((id: string) => ({
        id,
        title: `Artwork ${id}`,
        price: 125,
        currency: harness.artworkCurrency,
        artistId: 'artist-1',
        images: [],
        inventory: harness.inventory,
        artist: { displayName: 'Artist One' },
      }))),
    },
    inventory: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (where.version !== harness.inventory.version) return { count: 0 };
        harness.inventory.reservedQuantity += data.reservedQuantity.increment;
        harness.inventory.version += data.version.increment;
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }: any) => {
        harness.inventory.reservedQuantity -= data.reservedQuantity.decrement;
        return harness.inventory;
      }),
    },
    inventoryReservation: {
      create: vi.fn(async ({ data }: any) => {
        const reservation = { id: `r-${harness.reservations.length + 1}`, status: 'ACTIVE', ...data };
        harness.reservations.push(reservation);
        return reservation;
      }),
      findMany: vi.fn(async ({ where }: any) => harness.reservations.filter((r) =>
        r.checkoutIntentId === where.checkoutIntentId && (!where.status || r.status === where.status),
      )),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const ids: string[] = where.id?.in ?? [where.id];
        const matching = harness.reservations.filter((r) => ids.includes(r.id) && r.status === where.status);
        for (const reservation of matching) Object.assign(reservation, data);
        return { count: matching.length };
      }),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: any) => unknown) => {
      const prior = harness.txTail;
      let release!: () => void;
      harness.txTail = new Promise<void>((resolve) => (release = resolve));
      await prior;
      try { return await fn(prismaMock); } finally { release(); }
    }),
  };
  return { prisma: prismaMock };
});

vi.mock('../lib/stripe.js', () => ({
  stripe: { checkout: { sessions: { create: harness.stripeCreate } } },
}));

import { createCheckoutSession } from '../controllers/checkoutController.js';

const CART = { items: [{ artworkId: 'art-1', quantity: 1 }] };
const KEY = 'checkout-intent-key-1234567890';

async function submit(
  body: unknown = CART,
  key = KEY,
  controller = createCheckoutSession,
) {
  const req: any = { user: { id: 'buyer-1', email: 'buyer@example.test' }, body, get: () => key };
  const result: any = { statusCode: 200, body: null, error: null };
  const res: any = { json(value: unknown) { result.body = value; return this; }, status(value: number) { result.statusCode = value; return this; } };
  await controller(req, res, (error: unknown) => { result.error = error; });
  if (result.error) result.statusCode = (result.error as any).status ?? 500;
  return result;
}

beforeEach(() => {
  vi.resetAllMocks();
  harness.intents.clear();
  harness.reservations = [];
  harness.inventory = { quantity: 4, reservedQuantity: 0, soldQuantity: 0, version: 1 };
  harness.artworkCurrency = 'USD';
  harness.txTail = Promise.resolve();
  harness.stripeCreate.mockResolvedValue({ id: 'cs_test_stable', url: 'https://checkout.test/session', expires_at: Math.floor(Date.now() / 1000) + 3600 });
});

describe('durable checkout intent', () => {
  it('reuses the saved session for the same user, key, and cart across separate requests', async () => {
    const first = await submit();
    const retry = await submit();

    expect(first.statusCode).toBe(200);
    expect(retry.body.data.checkoutUrl).toBe('https://checkout.test/session');
    expect(retry.body.data.reused).toBe(true);
    expect(harness.stripeCreate).toHaveBeenCalledTimes(1);
    expect(harness.reservations).toHaveLength(1);
    expect(harness.inventory.reservedQuantity).toBe(1);
    const savedIntent = [...harness.intents.values()][0]!;
    expect(savedIntent.providerRequest.metadata).toMatchObject({ commissionRateBps: '1000' });
    expect(savedIntent.providerRequest.metadata.commissionRate).toBeUndefined();
  });

  it('does not create a checkout for a legacy non-USD listing before reconciliation', async () => {
    harness.artworkCurrency = 'XAF';
    const result = await submit();
    expect(result.statusCode).toBe(409);
    expect(result.error.code).toBe('LISTING_PRICE_UNVERIFIED');
    expect(harness.intents.size).toBe(0);
    expect(harness.reservations).toHaveLength(0);
    expect(harness.stripeCreate).not.toHaveBeenCalled();
  });

  it('recovers the persisted intent after controller module reconstruction', async () => {
    await submit();
    vi.resetModules();
    const reconstructed = await import('../controllers/checkoutController.js');
    const retry = await submit(CART, KEY, reconstructed.createCheckoutSession);

    expect(retry.statusCode).toBe(200);
    expect(retry.body.data.checkoutUrl).toBe('https://checkout.test/session');
    expect(harness.stripeCreate).toHaveBeenCalledTimes(1);
    expect(harness.reservations).toHaveLength(1);
  });

  it('rejects reuse of a key with a different cart', async () => {
    await submit();
    const changed = await submit({ items: [{ artworkId: 'other-art', quantity: 1 }] });

    expect(changed.statusCode).toBe(409);
    expect(changed.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(harness.reservations).toHaveLength(1);
  });

  it('serializes concurrent requests for the same intent without reserving twice', async () => {
    const [one, two] = await Promise.all([submit(), submit()]);

    expect(one.statusCode).toBe(200);
    expect([200, 503]).toContain(two.statusCode);
    expect(harness.intents.size).toBe(1);
    expect(harness.reservations).toHaveLength(1);
    expect(harness.inventory.reservedQuantity).toBe(1);
  });

  it('replays an ambiguous provider create with the same persisted parameters and key', async () => {
    harness.stripeCreate.mockRejectedValueOnce(new Error('connection timed out'));
    const first = await submit();
    expect(first.statusCode).toBe(503);
    expect([...harness.intents.values()][0].status).toBe('UNKNOWN');

    const retry = await submit();
    expect(retry.statusCode).toBe(200);
    expect(harness.stripeCreate).toHaveBeenCalledTimes(2);
    expect(harness.stripeCreate.mock.calls[0]![0]).toEqual(harness.stripeCreate.mock.calls[1]![0]);
    expect(harness.stripeCreate.mock.calls[0]![1]).toEqual(harness.stripeCreate.mock.calls[1]![1]);
    expect(harness.reservations).toHaveLength(1);
  });

  it('releases reservations only after a definite provider rejection', async () => {
    harness.stripeCreate.mockRejectedValueOnce(Object.assign(new Error('invalid request'), { statusCode: 400 }));
    const result = await submit();

    expect(result.statusCode).toBe(502);
    expect([...harness.intents.values()][0].status).toBe('FAILED');
    expect(harness.reservations[0].status).toBe('RELEASED');
    expect(harness.inventory.reservedQuantity).toBe(0);
  });

  it('does not let a replaced worker release reservations or overwrite its newer session', async () => {
    let rejectOld!: (error: Error) => void;
    harness.stripeCreate.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    const oldWorker = submit();
    await vi.waitFor(() => expect(harness.stripeCreate).toHaveBeenCalledTimes(1));
    const intent = [...harness.intents.values()][0]!;
    const oldToken = intent.creationLeaseToken;
    intent.creationLeaseUntil = new Date(Date.now() - 1000);

    const newWorker = await submit();
    expect(newWorker.statusCode).toBe(200);
    expect(intent.status).toBe('OPEN');
    expect(intent.creationLeaseToken).toBeNull();
    expect(oldToken).not.toBeNull();

    rejectOld(Object.assign(new Error('late provider rejection'), { statusCode: 400 }));
    const staleResult = await oldWorker;
    expect(staleResult.statusCode).toBe(503);
    expect(intent.status).toBe('OPEN');
    expect(harness.reservations).toHaveLength(1);
    expect(harness.reservations[0].status).toBe('ACTIVE');
    expect(harness.inventory.reservedQuantity).toBe(1);
  });

  it('does not let an old ambiguous worker downgrade a paid intent', async () => {
    let rejectOld!: (error: Error) => void;
    harness.stripeCreate.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    const oldWorker = submit();
    await vi.waitFor(() => expect(harness.stripeCreate).toHaveBeenCalledTimes(1));
    const intent = [...harness.intents.values()][0]!;
    intent.status = 'PAID';
    intent.creationLeaseUntil = null;
    intent.creationLeaseToken = null;

    rejectOld(new Error('late network timeout'));
    const staleResult = await oldWorker;

    expect(staleResult.statusCode).toBe(503);
    expect(intent.status).toBe('PAID');
    expect(harness.reservations[0].status).toBe('ACTIVE');
    expect(harness.inventory.reservedQuantity).toBe(1);
  });
});
