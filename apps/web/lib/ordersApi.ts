import { firebaseAuth } from './firebaseClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface OrderItemView {
  id: string;
  titleSnapshot: string;
  artistNameSnapshot: string;
  unitPrice: string;
  quantity: number;
  currency: string;
  subtotal: string;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: string;
  totalAmount: string;
  currency: string;
  createdAt: string;
  items: OrderItemView[];
}

async function authHeader(): Promise<HeadersInit> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function fetchMyOrders(): Promise<OrderView[]> {
  const res = await fetch(`${API_URL}/api/v1/orders`, {
    headers: { Accept: 'application/json', ...(await authHeader()) },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load orders');
  const json = await res.json();
  return json.data as OrderView[];
}
