const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

export async function fetchUserFavorites(): Promise<any[]> {
  const res = await fetch(`${API_URL}/api/v1/favorites`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error('Failed to load favorites');
  const json = await res.json();
  return json.data.artworks;
}

export async function toggleFavoriteApi(artworkId: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/v1/favorites/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artworkId }),
  });

  if (!res.ok) throw new Error('Failed to toggle favorite');
  const json = await res.json();
  return json.isFavorited;
}
