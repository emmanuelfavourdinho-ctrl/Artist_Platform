export interface Artwork {
  id: string;
  title: string;
  description?: string;
  imageUrl: string;
  price?: number;
  category?: string;
  createdAt?: string;
}

export interface ListArtworksQuery {
  page?: number | string;
  limit?: number | string;
  search?: string;
  category?: string;
  sort?: string;
  [key: string]: any;
}

export interface ListArtworksResponse {
  data: Artwork[];
  total: number;
  page: number;
  totalPages: number;
}
