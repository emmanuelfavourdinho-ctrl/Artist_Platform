import { z } from 'zod';

const SORT_OPTIONS = ['featured', 'newest', 'price_asc', 'price_desc'] as const;

export const listArtworksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
  category: z.string().trim().optional(),
  medium: z.string().trim().optional(),
  style: z.string().trim().optional(),
  theme: z.string().trim().optional(),
  // Artist SLUG, not id — the frontend never needs to know or handle
  // internal database ids to filter "show me this artist's work."
  artist: z.string().trim().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  sort: z.enum(SORT_OPTIONS).default('featured'),
});

export type ListArtworksQuery = z.infer<typeof listArtworksQuerySchema>;
