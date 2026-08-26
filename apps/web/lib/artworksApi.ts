const API_URL = process.env.API_URL ?? 'http://localhost:4000';

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

export async function fetchArtistBySlug(slug: string): Promise<ArtistProfileData | null> {
  const res = await fetch(`${API_URL}/api/v1/artists/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load artist (${res.status})`);

  const body = await res.json();
  return body.data;
}
