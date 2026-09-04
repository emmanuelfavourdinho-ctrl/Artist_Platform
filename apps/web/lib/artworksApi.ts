import type {
  ListArtworksQuery,
  ListArtworksResponse,
  ArtworkDetail,
  ArtworkDetailResponse,
} from '../types/artwork';

// Re-exported so every existing `import { ArtworkSummary } from
// '../../lib/artworksApi'` style import across the app keeps working
// unchanged — the real definitions live in types/artwork.ts, this file
// just re-exports them alongside the fetch functions that use them.
export type {
  ArtworkArtistSummary,
  ArtworkArtistDetail,
  ArtworkImageSummary,
  ArtworkDetailImage,
  ArtworkTag,
  ArtworkSummary,
  ArtworkDimensions,
  ArtworkDetail,
  Pagination,
  ArtworkSortOption,
  ListArtworksQuery,
  ListArtworksResponse,
  ArtworkDetailResponse,
} from '../types/artwork';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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

// GET /api/v1/artworks/:slug — the real backend route (see
// artworkControllers.ts's getArtworkBySlug) looks artwork up by SLUG,
// not by database id, and only ever returns published/public pieces —
// a draft or unpublished slug 404s exactly like a nonexistent one.
// Returns null on 404 rather than throwing, so callers can call
// Next's notFound() cleanly instead of needing a try/catch.
export async function fetchArtworkBySlug(slug: string): Promise<ArtworkDetail | null> {
  const res = await fetch(`${API_URL}/api/v1/artworks/${slug}`, {
    next: { revalidate: 60 },
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    throw new Error(`Failed to load artwork "${slug}" (${res.status})`);
  }

  const body: ArtworkDetailResponse = await res.json();
  return body.data;
}
