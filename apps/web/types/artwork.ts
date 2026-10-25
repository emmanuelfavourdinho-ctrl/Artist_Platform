export interface ArtworkArtistSummary {
  name: string;
  slug: string;
  verified: boolean;
}

export interface ArtworkArtistDetail extends ArtworkArtistSummary {
  biography: string | null;
  profileImageUrl: string | null;
}

export interface ArtworkImageSummary {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface ArtworkDetailImage extends ArtworkImageSummary {
  id: string;
  isPrimary: boolean;
}

export interface ArtworkTag {
  name: string;
  slug: string;
}

// Prisma serializes Decimal columns to strings. Keep listing amounts exact;
// use the currency-aware listing formatter rather than converting to Number.
export interface ArtworkSummary {
  id: string;
  slug: string;
  title: string;
  price: string;
  currency: string;
  image: ArtworkImageSummary | null;
  artist: ArtworkArtistSummary;
  available: boolean;
  priceReconciliationRequired?: boolean;
}

export interface ArtworkDimensions {
  width: string | null;
  height: string | null;
  depth: string | null;
  weight: string | null;
}

export interface ArtworkDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  price: string;
  currency: string;
  yearCreated: number | null;
  dimensions: ArtworkDimensions;
  materials: string | null;
  publishedAt: string | null;
  images: ArtworkDetailImage[];
  categories: ArtworkTag[];
  styles: ArtworkTag[];
  themes: ArtworkTag[];
  mediums: ArtworkTag[];
  available: boolean;
  priceReconciliationRequired?: boolean;
  artist: ArtworkArtistDetail;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// Keep in sync with apps/api/src/validation/artwork.ts's SORT_OPTIONS —
// this is the frontend's copy of the same fixed list. 'popular' is NOT
// a real option; using it anywhere sends an invalid value to the
// backend, which rejects it.
export type ArtworkSortOption = 'featured' | 'newest' | 'price_asc' | 'price_desc';

export interface ListArtworksQuery {
  page?: number | string;
  pageSize?: number | string;
  category?: string;
  medium?: string;
  style?: string;
  theme?: string;
  artist?: string;
  minPrice?: number | string;
  maxPrice?: number | string;
  sort?: ArtworkSortOption;
}

export interface ListArtworksResponse {
  status: 'success';
  data: ArtworkSummary[];
  pagination: Pagination;
}

export interface ArtworkDetailResponse {
  status: 'success';
  data: ArtworkDetail;
}
