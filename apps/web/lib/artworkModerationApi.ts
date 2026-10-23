import { adminRequest, type Pagination } from './adminApi';

export interface ArtworkModerationItem {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: string | number;
  currency: string;
  yearCreated: number | null;
  width: string | number | null;
  height: string | number | null;
  depth: string | number | null;
  materials: string | null;
  status: string;
  visibility: string;
  createdAt: string;
  images: { id: string; url: string; altText: string | null; isPrimary: boolean }[];
  categories: { category: { id: string; name: string } }[];
  styles: { style: { id: string; name: string } }[];
  themes: { theme: { id: string; name: string } }[];
  mediums: { medium: { id: string; name: string } }[];
  artist: { id: string; displayName: string; slug: string; profileImageUrl: string | null };
  moderationHistory?: {
    id: string;
    action: string;
    reason: string | null;
    createdAt: string;
    adminId: string | null;
  }[];
}

export const fetchArtworkQueue = (params: { page: number; pageSize: number }) =>
  adminRequest<ArtworkModerationItem[]>('GET', '/admin/artworks', { query: params }) as Promise<{
    data: ArtworkModerationItem[];
    pagination?: Pagination;
  }>;

export const fetchArtworkDetail = (id: string) =>
  adminRequest<ArtworkModerationItem>('GET', `/admin/artworks/${id}`).then(
    (response) => response.data,
  );

export const decideArtwork = (
  id: string,
  body: { action: 'approve' | 'reject'; reason?: string },
) =>
  adminRequest<{ id: string; status: 'APPROVED' | 'REJECTED' }>('PATCH', `/admin/artworks/${id}`, {
    body,
  });
