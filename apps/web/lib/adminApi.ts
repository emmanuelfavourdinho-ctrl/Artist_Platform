import { firebaseAuth } from './firebaseClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Carries the HTTP status so the UI can tell "you are not allowed" (403)
// apart from "the server is down" (5xx) instead of showing one vague
// message for everything.
export interface FieldIssue {
  path: string;
  message: string;
}

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Machine-readable error code from the API (e.g. REQUEST_ALREADY_OPEN). */
    public readonly code?: string,
    /** Per-field validation problems, when the API sent them. */
    public readonly issues: FieldIssue[] = [],
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

export const STAFF_ROLE_NAMES = ['ADMIN', 'MODERATOR', 'FINANCE_ADMIN'];

export type Query = Record<string, string | number | undefined>;

// Authenticated JSON request helper. Used by the admin console and by the
// artist studio's verification screens — the name is historical.
export async function adminRequest<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  options: { query?: Query; body?: unknown } = {},
): Promise<{ data: T; pagination?: Pagination }> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new AdminApiError(401, 'You need to be signed in.');

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${await user.getIdToken()}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new AdminApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      code?: string;
      details?: unknown;
    } | null;
    const fallback =
      response.status === 403
        ? 'You do not have permission to do this.'
        : 'The server could not complete this request.';
    const issues = Array.isArray(body?.details)
      ? (body.details as FieldIssue[]).filter(
          (d) => d && typeof d.path === 'string' && typeof d.message === 'string',
        )
      : [];
    throw new AdminApiError(response.status, body?.message ?? fallback, body?.code, issues);
  }

  const json = (await response.json()) as { data: T; pagination?: Pagination };
  return { data: json.data, pagination: json.pagination };
}

const adminGet = async <T>(path: string, query?: Query) => (await adminRequest<T>('GET', path, { query })).data;

export const fetchAdminOverview = () => adminGet<AdminOverview>('/admin/overview');

export const fetchAnalyticsDashboard = (range: AnalyticsRange) =>
  adminGet<AnalyticsDashboard>(`/analytics/dashboard?range=${range}`);

// ---------------------------------------------------------------------------
// Session, users, enforcement, roles, audit log
// ---------------------------------------------------------------------------

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminSession {
  id: string;
  roles: string[];
  permissions: string[];
}

export type AccountStatus =
  | 'ACTIVE'
  | 'PENDING_VERIFICATION'
  | 'RESTRICTED'
  | 'SUSPENDED'
  | 'BANNED'
  | 'DEACTIVATED';

export interface AdminUserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: AccountStatus;
  createdAt: string;
  roles: string[];
  artistProfile: { id: string; displayName: string; verificationStatus: string } | null;
}

export interface EnforcementRecord {
  id: string;
  action: 'WARNING' | 'RESTRICTION' | 'SUSPENSION' | 'BAN' | 'REINSTATEMENT';
  reason: string;
  previousStatus: AccountStatus | null;
  newStatus: AccountStatus | null;
  expiresAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string } | null;
}

export interface AdminUserDetail extends Omit<AdminUserRow, 'artistProfile'> {
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  emailVerifiedAt: string | null;
  artistProfile:
    | (AdminUserRow['artistProfile'] & { slug: string; verifiedAt: string | null; _count: { artworks: number } })
    | null;
  _count: { orders: number; commissionsRequested: number; reviews: number };
  activeMeasure: EnforcementRecord | null;
  enforcements: EnforcementRecord[];
  reportsAgainst: { id: string; reason: string; status: string; createdAt: string }[];
  recentAudit: {
    id: string;
    action: string;
    reason: string | null;
    createdAt: string;
    user: { id: string; firstName: string; lastName: string } | null;
  }[];
}

export interface ListUsersParams {
  page?: number;
  search?: string;
  status?: string;
  role?: string;
  sort?: 'createdAt' | 'email' | 'lastName';
  dir?: 'asc' | 'desc';
}

export type EnforcementActionRequest = 'WARNING' | 'RESTRICT' | 'SUSPEND' | 'BAN' | 'REINSTATE';

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface ListAuditParams {
  page?: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: string;
  to?: string;
}

export interface AdminFinanceParams {
  page?: number;
  pageSize?: number;
  status?: string;
  currency?: string;
  from?: string;
  to?: string;
  reference?: string;
}

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: string;
  shippingAmount: string;
  taxAmount: string;
  discountAmount: string;
  totalAmount: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  _count: { items: number; payments: number };
}

export interface AdminPaymentRow {
  id: string;
  provider: string;
  providerPaymentId: string | null;
  amount: string;
  currency: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPaymentListRow extends AdminPaymentRow {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: string;
    currency: string;
    createdAt: string;
  };
}

export interface AdminOrderDetail extends AdminOrderRow {
  items: {
    id: string;
    titleSnapshot: string;
    artistNameSnapshot: string;
    unitPrice: string;
    quantity: number;
    currency: string;
    subtotal: string;
    commissionRate: string;
    commissionAmount: string;
  }[];
  payments: AdminPaymentRow[];
}

export interface AdminPaymentDetail extends AdminPaymentRow {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    subtotal: string;
    shippingAmount: string;
    taxAmount: string;
    discountAmount: string;
    totalAmount: string;
    currency: string;
    createdAt: string;
    items: AdminOrderDetail['items'];
  };
}

export const fetchAdminSession = () => adminGet<AdminSession>('/admin/session');

export const fetchAdminUsers = (params: ListUsersParams) =>
  adminRequest<AdminUserRow[]>('GET', '/admin/users', { query: { ...params, pageSize: 20 } });

export const fetchAdminUser = (id: string) => adminGet<AdminUserDetail>(`/admin/users/${id}`);

export const enforceUser = (
  id: string,
  body: { action: EnforcementActionRequest; reason: string; expiresAt?: string },
) => adminRequest<{ status: AccountStatus }>('POST', `/admin/users/${id}/enforcement`, { body });

export const changeUserRole = (
  id: string,
  body: { role: string; operation: 'GRANT' | 'REVOKE'; reason: string },
) => adminRequest<{ roles: string[] }>('POST', `/admin/users/${id}/roles`, { body });

export const fetchAuditLogs = (params: ListAuditParams) =>
  adminRequest<AuditEntry[]>('GET', '/admin/audit-logs', { query: { ...params, pageSize: 25 } });

export const fetchAdminOrders = (params: AdminFinanceParams) =>
  adminRequest<AdminOrderRow[]>('GET', '/admin/orders', { query: { ...params, pageSize: params.pageSize ?? 20 } });

export const fetchAdminOrder = (id: string) => adminGet<AdminOrderDetail>(`/admin/orders/${id}`);

export const fetchAdminPayments = (params: AdminFinanceParams) =>
  adminRequest<AdminPaymentListRow[]>('GET', '/admin/payments', { query: { ...params, pageSize: params.pageSize ?? 20 } });

export const fetchAdminPayment = (id: string) => adminGet<AdminPaymentDetail>(`/admin/payments/${id}`);
