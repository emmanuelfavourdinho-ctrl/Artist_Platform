const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/* ------------------------------------------------------------------ */
/* Interfaces & Validation Schemas                                    */
/* ------------------------------------------------------------------ */

export interface ArtistArtworkSummary {
  id: string;
  slug: string;
  title: string;
  price: string;
  currency: string;
  image: { url: string; altText: string | null } | null;
  available: boolean;
}

export interface ArtistReview {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: string;
  verifiedPurchase: boolean;
  reviewerName: string;
  artworkTitle: string | null;
}

export interface ArtistProfileData {
  name: string;
  slug: string;
  biography: string | null;
  artisticStatement: string | null;
  location: string | null;
  profileImageUrl: string | null;
  coverImageUrl: string | null;
  verified: boolean;
  joinedAt: string;
  rating: { average: number | null; count: number };
  artworks: ArtistArtworkSummary[];
  reviews: ArtistReview[];
}

export interface Artwork {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  price: string;
  currency: string;
  medium: string | null;
  dimensions: string | null;
  imageUrl: string;
  available: boolean;
  artist: {
    name: string;
    slug: string;
  };
}

/* ------------------------------------------------------------------ */
/* API Client Functions                                               */
/* ------------------------------------------------------------------ */

/**
 * Fetches an artist profile by slug.
 */
export async function fetchArtistBySlug(slug: string): Promise<ArtistProfileData | null> {
  const sanitizedSlug = encodeURIComponent(slug.trim());
  const res = await fetch(`${API_URL}/api/v1/artists/${sanitizedSlug}`, {
    next: { revalidate: 60 },
    headers: {
      Accept: 'application/json',
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to load artist profile (HTTP ${res.status})`);
  }

  const body = await res.json();
  return body.data ?? null;
}

/**
 * Fetches list of artworks for the gallery page.
 */
export async function fetchArtworks(): Promise<Artwork[]> {
  const res = await fetch(`${API_URL}/api/v1/artworks`, {
    next: { revalidate: 60 },
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load artworks (HTTP ${res.status})`);
  }

  const body = await res.json();
  return body.data ?? [];
}
