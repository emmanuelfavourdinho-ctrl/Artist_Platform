import { firebaseAuth } from './firebaseClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type ContactMessageStatus = 'UNREAD' | 'READ' | 'REPLIED' | 'ARCHIVED';

export interface AdminContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: ContactMessageStatus;
  emailSentAt: string | null;
  emailError: string | null;
  createdAt: string;
}

export interface ContactMessagePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unreadTotal: number;
}

export interface ContactMessagePage {
  data: AdminContactMessage[];
  pagination: ContactMessagePagination;
}

export type ContactMessageView = 'INBOX' | 'ARCHIVED';

export class AdminContactApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AdminContactApiError';
  }
}

async function authHeader(): Promise<HeadersInit> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new AdminContactApiError('Your session has expired. Please sign in again.', 401);
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    throw new AdminContactApiError('Could not verify your session. Please sign in again.', 401);
  }
  return { Authorization: `Bearer ${token}` };
}

async function requestJson<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const auth = await authHeader();
  let res: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    new Headers(auth).forEach((value, key) => headers.set(key, value));
    res = await fetch(`${API_URL}/api/v1${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });
  } catch {
    throw new AdminContactApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
    const message =
      res.status === 403
        ? 'You do not have permission to manage contact messages.'
        : res.status === 409
          ? 'Another staff member changed this message. The inbox is refreshing.'
          : (body?.message ?? fallback);
    throw new AdminContactApiError(message, res.status, body?.code);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new AdminContactApiError('The server returned an invalid response. Please try again.', res.status);
  }
}

export async function fetchContactMessages(
  query: { page: number; pageSize: number; view: ContactMessageView },
): Promise<ContactMessagePage> {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize), view: query.view });
  const json = await requestJson<{ data: AdminContactMessage[]; pagination: ContactMessagePagination }>(
    `/admin/contact-messages?${params.toString()}`,
    { method: 'GET' },
    'Could not load contact messages. Please try again.',
  );
  return json;
}

export async function updateMessageStatus(id: string, status: ContactMessageStatus): Promise<AdminContactMessage> {
  const json = await requestJson<{ data: AdminContactMessage }>(`/admin/contact-messages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }, 'Could not update this contact message. Please try again.');
  return json.data;
}
