import { firebaseAuth } from './firebaseClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function authHeader(): Promise<HeadersInit> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export interface CheckoutItemInput {
  artworkId: string;
  quantity: number;
}

export function checkoutIntentStorageKey(userId: string, items: CheckoutItemInput[]): string {
  const cart = [...items]
    .map((item) => [item.artworkId, item.quantity])
    .sort(([a], [b]) => String(a).localeCompare(String(b)));
  return `checkout-intent:${userId}:${JSON.stringify(cart)}`;
}

export async function createCheckoutSession(
  items: CheckoutItemInput[],
  idempotencyKey: string,
): Promise<string> {
  const res = await fetch(`${API_URL}/api/v1/checkout/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      ...(await authHeader()),
    },
    body: JSON.stringify({ items }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const error = new Error(body?.message ?? 'Could not start checkout. Please try again.') as Error & {
      code?: string;
    };
    error.code = body?.code;
    throw error;
  }

  const json = await res.json();
  return json.data.checkoutUrl as string;
}
