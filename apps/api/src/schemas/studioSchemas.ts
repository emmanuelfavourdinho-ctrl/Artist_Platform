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

const artworkImageSchema = z.object({
  publicId: z.string().min(1),
  secureUrl: z.string().url(),
  resourceType: z.literal('image'),
  format: z.string().min(1).max(20),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  bytes: z.number().int().positive().max(50_000_000),
  version: z.number().int().positive(),
  signature: z.string().regex(/^[a-f0-9]{40}$/i),
  altText: z.string().max(200).optional(),
});

const dimensionsSchema = z.string().trim().regex(/^\d{1,6}(?:\.\d{1,2})?$/).optional();

export const createArtworkSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().max(10_000).optional(),
  price: usdPriceSchema,
  currency: z.literal('USD').default('USD'),
  images: z.array(artworkImageSchema).min(1).max(10),
  yearCreated: z.number().int().min(1000).max(new Date().getFullYear()).optional(),
  width: dimensionsSchema,
  height: dimensionsSchema,
  depth: dimensionsSchema,
  materials: z.string().trim().max(500).optional(),
});

export const updateArtworkSchema = createArtworkSchema
  .omit({ currency: true })
  .partial()
  .extend({ images: z.array(artworkImageSchema).min(1).max(10) });

export const artworkIdSchema = z.string().uuid();

export const cloudinaryUploadSignatureSchema = z.object({
  timestamp: z.number().int().positive(),
});

const artistImageSchema = z.object({
  publicId: z.string().min(1).max(255),
  secureUrl: z.string().url().max(2048),
  resourceType: z.literal('image'),
  format: z.enum(['jpg', 'jpeg', 'png', 'webp']),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  bytes: z.number().int().positive().max(10_000_000),
  version: z.number().int().positive(),
  signature: z.string().regex(/^[a-f0-9]{40}$/i),
});

export const updateArtistProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  biography: z.string().trim().min(20).max(2000),
  artisticStatement: z.string().trim().max(2000).optional(),
  mission: z.string().trim().max(2000).optional(),
  website: z.string().trim().url().max(500).optional().or(z.literal('')),
  location: z.string().trim().max(120).optional(),
  profileImage: artistImageSchema.optional(),
  coverImage: artistImageSchema.optional(),
});

export type CreateArtworkInput = z.infer<typeof createArtworkSchema>;
