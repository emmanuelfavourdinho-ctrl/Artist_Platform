import { z } from 'zod';

export const createArtworkSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().optional(),
  price: z.coerce.number().positive('Price must be greater than 0'),
  currency: z.string().default('USD'),
  imageUrl: z.string().url('Invalid image URL'),
  categoryId: z.string().optional(),
  mediumId: z.string().optional(),
  styleId: z.string().optional(),
  themeId: z.string().optional(),
});

export type CreateArtworkInput = z.infer<typeof createArtworkSchema>;
