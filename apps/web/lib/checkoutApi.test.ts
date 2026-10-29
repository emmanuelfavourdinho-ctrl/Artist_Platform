import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./firebaseClient', () => ({
  firebaseAuth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('test-token') } },
}));

import { checkoutIntentStorageKey, createCheckoutSession } from './checkoutApi';

afterEach(() => vi.unstubAllGlobals());

describe('checkout intent client key', () => {
  it('creates the same user-scoped storage key for equivalent cart ordering', () => {
    const first = checkoutIntentStorageKey('user-1', [
      { artworkId: 'b', quantity: 1 },
      { artworkId: 'a', quantity: 2 },
    ]);
    const retry = checkoutIntentStorageKey('user-1', [
      { artworkId: 'a', quantity: 2 },
      { artworkId: 'b', quantity: 1 },
    ]);

    expect(first).toBe(retry);
    expect(checkoutIntentStorageKey('user-2', [{ artworkId: 'a', quantity: 2 }])).not.toBe(first);
  });

  it('sends the persisted idempotency key on every checkout request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { checkoutUrl: 'https://checkout.test/session' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const url = await createCheckoutSession([{ artworkId: 'art-1', quantity: 1 }], 'stable-key');
    const [, options] = fetchMock.mock.calls[0]!;

    expect(url).toBe('https://checkout.test/session');
    expect(options.headers['Idempotency-Key']).toBe('stable-key');
    expect(options.headers.Authorization).toBe('Bearer test-token');
  });
});
