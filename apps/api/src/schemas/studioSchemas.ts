import { z } from 'zod';

const usdPriceSchema = z
  .union([z.string(), z.number().finite()])
  .transform((value) => String(value))
  .refine((value) => /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value), {
    message: 'Price must be a positive USD amount with no more than two decimal places',
  })
  .refine((value) => {
    try {
      const [whole, fraction = ''] = value.split('.');
      return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0') || '0') > 0n;
    } catch {
      return false;
    }
  }, { message: 'Price must be greater than 0' });

export const createArtworkSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().optional(),
  price: usdPriceSchema,
  currency: z.literal('USD').default('USD'),
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

export const updateArtistProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  biography: z.string().trim().min(20).max(2000),
  location: z.string().trim().max(120).optional(),
});

export type CreateArtworkInput = z.infer<typeof createArtworkSchema>;
