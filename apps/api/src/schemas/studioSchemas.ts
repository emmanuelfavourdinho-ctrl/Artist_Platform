import { z } from 'zod';

export const createArtworkSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().optional(),
  price: z.coerce.number().positive('Price must be greater than 0'),
  currency: z.string().default('USD'),
  images: z
    .array(
      z.object({
        publicId: z.string().min(1),
        secureUrl: z.string().url(),
        resourceType: z.literal('image'),
        format: z.string().min(1).max(20),
        width: z.number().int().positive().max(20000),
        height: z.number().int().positive().max(20000),
        bytes: z.number().int().positive().max(50_000_000),
        altText: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(10),
  categoryId: z.string().optional(),
  mediumId: z.string().optional(),
  styleId: z.string().optional(),
  themeId: z.string().optional(),
});

export const cloudinaryUploadSignatureSchema = z.object({
  timestamp: z.number().int().positive(),
});

export type CreateArtworkInput = z.infer<typeof createArtworkSchema>;
