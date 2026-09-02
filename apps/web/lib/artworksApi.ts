import { ListArtworksQuery, ListArtworksResponse, Artwork } from '../types/artwork';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export async function fetchArtworks(query: ListArtworksQuery = {}): Promise<ListArtworksResponse> {
  const params = new URLSearchParams();

  // Clean empty strings, null, or undefined values so Express receives a valid query object
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }

  // Ensure default page fallback value exists if missing
  if (!params.has('page')) params.set('page', '1');

  const queryString = params.toString();
  const url = `${API_URL}/api/v1/artworks${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`Failed to load artworks (${res.status})`);
  }

  return res.json();
}

export async function fetchArtworkById(id: string): Promise<Artwork> {
  const res = await fetch(`${API_URL}/api/v1/artworks/${id}`, {
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch artwork with ID: ${id}`);
  }

  return res.json();
}
