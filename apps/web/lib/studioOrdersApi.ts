import { firebaseAuth } from './firebaseClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ArtistOrderFulfillmentView {
  orderId: string;
  carrier: string | null;
  trackingReference: string | null;
  trackingUrl: string | null;
  evidenceReferences: string[];
  shippedAt: string | null;
  artistCompletionConfirmedAt: string | null;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    createdAt: string;
    buyerReceivedGoodAt: string | null;
    artistResponseDeadline: string | null;
    releaseStatus: string;
    items: Array<{ id: string; title: string; quantity: number; price: string; currency: string }>;
    deliveryDisputes: Array<{
      id: string;
      status: string;
      reason: string;
      description: string;
      evidenceReferences: string[];
      artistResponse: string | null;
      artistEvidenceReferences: string[];
      artistRespondedAt: string | null;
      resolutionNote: string | null;
      resolvedAt: string | null;
      createdAt: string;
    }>;
  };
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  return fetch(`${API_URL}/api/v1/studio${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
    credentials: 'include',
  });
}

export async function fetchArtistOrderFulfillments(): Promise<ArtistOrderFulfillmentView[]> {
  const response = await request('/orders', { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to load artist orders');
  const body = await response.json();
  return body.data as ArtistOrderFulfillmentView[];
}

export async function submitShipment(input: {
  orderId: string;
  carrier: string;
  trackingReference: string;
  trackingUrl?: string;
}): Promise<void> {
  const response = await request(`/orders/${encodeURIComponent(input.orderId)}/shipments`, {
    method: 'POST',
    body: JSON.stringify({
      carrier: input.carrier,
      trackingReference: input.trackingReference,
      ...(input.trackingUrl ? { trackingUrl: input.trackingUrl } : {}),
    }),
  });
  if (!response.ok) throw new Error('Failed to submit shipment details');
}

export async function correctShipmentTracking(input: {
  orderId: string;
  carrier: string;
  trackingReference: string;
  trackingUrl?: string;
  reason: string;
}): Promise<void> {
  const response = await request(`/orders/${encodeURIComponent(input.orderId)}/shipments/tracking`, {
    method: 'PATCH',
    body: JSON.stringify({
      carrier: input.carrier,
      trackingReference: input.trackingReference,
      ...(input.trackingUrl ? { trackingUrl: input.trackingUrl } : {}),
      reason: input.reason,
    }),
  });
  if (!response.ok) throw new Error('Failed to correct tracking details');
}

export async function confirmArtistOrderCompletion(orderId: string): Promise<void> {
  const response = await request(`/orders/${encodeURIComponent(orderId)}/confirm-completion`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to confirm order completion');
}
