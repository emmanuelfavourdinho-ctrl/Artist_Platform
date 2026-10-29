import { firebaseAuth } from './firebaseClient';
import type { UploadedCloudinaryImage } from '../components/ui/CloudinaryImageUpload';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface StudioArtwork {
  id: string;
  title: string;
  description: string | null;
  price: string;
  currency: string;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED' | 'SOLD';
  visibility: string;
  imageUrl: string;
  images: UploadedCloudinaryImage[];
  available: boolean;
  priceReconciliationRequired: boolean;
  materials: string | null;
  yearCreated: number | null;
  width: string | null;
  height: string | null;
  depth: string | null;
  moderationHistory: Array<{ action: string; reason: string | null; createdAt: string }>;
}

export interface ArtistProfileView {
  id: string;
  displayName: string;
  slug: string;
  biography: string | null;
  artisticStatement: string | null;
  mission: string | null;
  website: string | null;
  location: string | null;
  profileImageUrl: string | null;
  coverImageUrl: string | null;
  verificationStatus: string;
}

export interface StudioEarnings {
  payouts: Array<{
    id: string;
    orderId: string;
    fulfillmentId: string;
    amountMinorUnits: string;
    commissionMinorUnits: string;
    currency: string;
    status: string;
    provider: string | null;
    providerReference: string | null;
    submittedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    order: { orderNumber: string; releaseStatus: string; releaseEligibleAt: string | null };
    events: Array<{ eventType: string; fromStatus: string | null; toStatus: string; occurredAt: string }>;
  }>;
  confirmedActivities: Array<{
    id: string;
    movementType: string;
    amountMinorUnits: string;
    currency: string;
    provider: string;
    providerObjectReference: string;
    occurredAt: string | null;
    recordedAt: string;
    order: { orderNumber: string } | null;
  }>;
  providerConfigured: boolean;
}

export interface StudioDispute {
  id: string;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  reason: string;
  description: string;
  evidenceReferences: string[];
  artistResponse: string | null;
  artistEvidenceReferences: string[];
  artistRespondedAt: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    artistResponseDeadline: string | null;
    releaseStatus: string;
    items: Array<{ id: string; title: string }>;
    deliveryEvents: Array<{ eventType: string; occurredAt: string }>;
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('not_authenticated');
  const authenticatedUser = user;
  async function send(forceRefresh: boolean) {
    const token = await authenticatedUser.getIdToken(forceRefresh);
    const response = await fetch(`${API_URL}/api/v1/studio${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
      credentials: 'include',
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    return { response, body };
  }
  let { response, body } = await send(false);
  if (response.status === 401 && body?.code === 'SESSION_INVALID') {
    ({ response, body } = await send(true));
  }
  if (!response.ok) {
    throw new Error(body?.message ?? body?.error ?? `Studio request failed (${response.status})`);
  }
  return body.data as T;
}

export async function fetchStudioArtworks(): Promise<{
  artworks: StudioArtwork[];
  artist: ArtistProfileView;
}> {
  return request('/artworks');
}

export async function fetchStudioArtistProfile(): Promise<ArtistProfileView> {
  return request('/profile');
}

export type StudioArtworkInput = {
  title: string;
  description: string;
  price: string;
  currency: 'USD';
  images: UploadedCloudinaryImage[];
  yearCreated?: number;
  width?: string;
  height?: string;
  depth?: string;
  materials?: string;
};

export async function createStudioArtwork(input: StudioArtworkInput): Promise<StudioArtwork> {
  return request('/artworks', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateStudioArtwork(
  id: string,
  input: Omit<StudioArtworkInput, 'currency' | 'price'> & { price?: string },
): Promise<StudioArtwork> {
  return request(`/artworks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function submitStudioArtwork(id: string): Promise<void> {
  await request(`/artworks/${encodeURIComponent(id)}/submit`, { method: 'POST' });
}

export async function publishStudioArtwork(id: string): Promise<void> {
  await request(`/artworks/${encodeURIComponent(id)}/publish`, { method: 'POST' });
}

export async function archiveStudioArtwork(id: string): Promise<void> {
  await request(`/artworks/${encodeURIComponent(id)}/archive`, { method: 'POST' });
}

export async function updateStudioArtistProfile(input: {
  displayName: string;
  biography: string;
  artisticStatement?: string;
  mission?: string;
  website?: string;
  location?: string;
  profileImage?: UploadedCloudinaryImage;
  coverImage?: UploadedCloudinaryImage;
}): Promise<ArtistProfileView> {
  return request('/profile', { method: 'PATCH', body: JSON.stringify(input) });
}

export async function fetchStudioEarnings(): Promise<StudioEarnings> {
  return request('/earnings');
}

export async function fetchStudioDisputes(): Promise<StudioDispute[]> {
  return request('/disputes');
}

export async function respondToStudioDispute(input: {
  disputeId: string;
  response: string;
  evidenceReferences?: string[];
}): Promise<{ id: string; respondedAt: string; duplicate: boolean }> {
  return request(`/disputes/${encodeURIComponent(input.disputeId)}/response`, {
    method: 'POST',
    body: JSON.stringify({
      response: input.response,
      evidenceReferences: input.evidenceReferences ?? [],
    }),
  });
}
