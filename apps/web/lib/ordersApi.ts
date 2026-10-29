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

export interface OrderDeliveryView {
  id: string;
  orderNumber: string;
  status: string;
  releaseStatus: 'NOT_ELIGIBLE' | 'ELIGIBLE' | 'BLOCKED';
  buyerReceivedGoodAt: string | null;
  artistResponseDeadline: string | null;
  releaseEligibleAt: string | null;
  releaseHoldAt: string | null;
  fulfillments: {
    artistName: string;
    carrier: string | null;
    trackingReference: string | null;
    trackingUrl: string | null;
    shippedAt: string | null;
    artistCompletionConfirmedAt: string | null;
  }[];
  disputes: {
    id: string;
    status: string;
    reason: string;
    description: string;
    evidenceReferences: string[];
    resolutionNote: string | null;
    resolvedAt: string | null;
    createdAt: string;
  }[];
  events: { eventType: string; occurredAt: string; metadata: unknown }[];
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

export async function fetchOrderDelivery(orderId: string): Promise<OrderDeliveryView> {
  const res = await fetch(`${API_URL}/api/v1/orders/${encodeURIComponent(orderId)}/delivery`, {
    headers: { Accept: 'application/json', ...(await authHeader()) },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load order delivery details');
  const json = await res.json();
  return json.data as OrderDeliveryView;
}

export async function confirmOrderReceipt(orderId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/orders/${encodeURIComponent(orderId)}/confirm-receipt`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(await authHeader()),
    },
    body: JSON.stringify({ confirmation: 'RECEIVED_IN_GOOD_CONDITION' }),
  });
  if (!res.ok) throw new Error('Could not confirm receipt. Reload the order and try again.');
}

export async function reportOrderDeliveryIssue(input: {
  orderId: string;
  reason: 'NOT_RECEIVED' | 'DAMAGED' | 'WRONG_ITEM' | 'OTHER';
  description: string;
  evidenceReferences?: string[];
}): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/v1/orders/${encodeURIComponent(input.orderId)}/delivery-issues`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(await authHeader()),
      },
      body: JSON.stringify({
        reason: input.reason,
        description: input.description,
        evidenceReferences: input.evidenceReferences ?? [],
      }),
    },
  );
  if (!res.ok) throw new Error('Could not report the delivery issue. Reload the order and try again.');
}
