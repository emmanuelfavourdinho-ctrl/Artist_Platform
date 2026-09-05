import { firebaseAuth } from './firebaseClient';
import type { ArtworkSummary } from '../types/artwork';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function authHeader(): Promise<HeadersInit> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function fetchUserFavorites(): Promise<ArtworkSummary[]> {
  const res = await fetch(`${API_URL}/api/v1/favorites`, {
    headers: { Accept: 'application/json', ...(await authHeader()) },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error('Failed to load favorites');
  const json = await res.json();
  return json.data.artworks;
}

export async function toggleFavoriteApi(artworkId: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/v1/favorites/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ artworkId }),
  });

  if (!res.ok) throw new Error('Failed to toggle favorite');
  const json = await res.json();
  return json.isFavorited;
}
