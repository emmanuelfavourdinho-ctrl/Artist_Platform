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

async function authHeader(): Promise<HeadersInit> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function fetchContactMessages(): Promise<AdminContactMessage[]> {
  const res = await fetch(`${API_URL}/api/v1/admin/contact-messages`, {
    headers: { Accept: 'application/json', ...(await authHeader()) },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load messages');
  const json = await res.json();
  return json.data as AdminContactMessage[];
}

export async function updateMessageStatus(
  id: string,
  status: ContactMessageStatus,
): Promise<AdminContactMessage> {
  const res = await fetch(`${API_URL}/api/v1/admin/contact-messages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update message');
  const json = await res.json();
  return json.data as AdminContactMessage;
}
