import { firebaseAuth } from './firebaseClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Carries the HTTP status so the UI can tell "you are not allowed" (403)
// apart from "the server is down" (5xx) instead of showing one vague
// message for everything.
export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export interface AdminOverview {
  users: { total: number };
  artists: { total: number; pendingVerification: number };
  artworks: { total: number; published: number };
  orders: { total: number; byStatus: Record<string, number> };
  queues: {
    pendingReviews: number;
    unreadContactMessages: number;
    openReports: number;
    pendingArtistVerification: number;
  };
}

export type AnalyticsRange = '7d' | '30d' | '90d' | '365d';

export interface CurrencyPayments {
  currency: string;
  payments: number;
  total: number;
}
export interface CurrencyOrderValue {
  currency: string;
  orders: number;
  total: number;
}
export interface CurrencyCommission {
  currency: string;
  orderItems: number;
  grossItemSales: number;
  platformCommission: number;
}
export interface DailyPoint {
  date: string;
  currency: string;
  payments: number;
  total: number;
}
export interface TopArtwork {
  artworkId: string | null;
  title: string | null;
  slug: string | null;
  imageUrl: string | null;
  unitsSold: number;
  orderItems: number;
  currency: string;
  salesValue: number;
}

export interface AnalyticsDashboard {
  range: { key: AnalyticsRange; days: number; from: string; to: string };
  orders: {
    byStatus: Record<string, number>;
    grossOrderValueByCurrency: CurrencyOrderValue[];
  };
  payments: {
    succeededByCurrency: CurrencyPayments[];
    byStatus: Record<string, number>;
    refundAmountsTracked: boolean;
  };
  commission: CurrencyCommission[];
  timeSeries: DailyPoint[];
  topArtworks: TopArtwork[];
  definitions: Record<string, string>;
}

async function adminGet<T>(path: string): Promise<T> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new AdminApiError(401, 'You need to be signed in.');

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      cache: 'no-store',
    });
  } catch {
    throw new AdminApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    const fallback =
      response.status === 403
        ? 'You do not have permission to view this.'
        : 'The server could not complete this request.';
    throw new AdminApiError(response.status, body?.message ?? fallback);
  }

  const json = (await response.json()) as { data: T };
  return json.data;
}

export const fetchAdminOverview = () => adminGet<AdminOverview>('/admin/overview');

export const fetchAnalyticsDashboard = (range: AnalyticsRange) =>
  adminGet<AnalyticsDashboard>(`/analytics/dashboard?range=${range}`);
