const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export interface ArtworkReview {
  id: string;
  rating: number;
  title: string | null;
  comment: string;
  createdAt: string;
  verifiedPurchase: boolean;
  reviewerName: string;
}

interface ListReviewsResponse {
  status: 'success';
  data: ArtworkReview[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export async function fetchArtworkReviews(artworkId: string): Promise<ListReviewsResponse> {
  const res = await fetch(`${API_URL}/api/v1/artworks/${artworkId}/reviews`, {
    // Reviews can appear moments after approval — shorter revalidation
    // window than the artwork catalog itself.
    next: { revalidate: 30 },
  });

  if (!res.ok) throw new Error(`Failed to load reviews (${res.status})`);
  return res.json();
}
