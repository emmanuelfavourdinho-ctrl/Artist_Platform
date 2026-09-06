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

export async function createCheckoutSession(items: CheckoutItemInput[]): Promise<string> {
  const res = await fetch(`${API_URL}/api/v1/checkout/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ items }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? 'Could not start checkout. Please try again.');
  }

  const json = await res.json();
  return json.data.checkoutUrl as string;
}
