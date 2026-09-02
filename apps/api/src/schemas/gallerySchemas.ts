import { z } from 'zod';

export const galleryFilterSchema = z.object({
  category: z.string().optional(),
  medium: z.string().optional(),
  style: z.string().optional(),
  theme: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'title']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
});

export type GalleryFilterQuery = z.infer<typeof galleryFilterSchema>;
