import { firebaseAuth } from './firebaseClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ProfileData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  memberSince?: string;
  roles?: string[];
}

async function authHeader(): Promise<HeadersInit> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function fetchMyProfile(): Promise<ProfileData> {
  const res = await fetch(`${API_URL}/api/v1/users/me`, {
    headers: { Accept: 'application/json', ...(await authHeader()) },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load profile');
  const json = await res.json();
  return json.data;
}

export async function updateMyProfile(input: {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}): Promise<ProfileData> {
  const res = await fetch(`${API_URL}/api/v1/users/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? 'Failed to update profile');
  }
  const json = await res.json();
  return json.data;
}
