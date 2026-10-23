import { z } from 'zod';

export const listArtworkQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const moderateArtworkSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), reason: z.string().trim().max(500).optional() }),
  z.object({
    action: z.literal('reject'),
    reason: z
      .string()
      .trim()
      .min(10, 'A rejection reason of at least 10 characters is required')
      .max(500),
  }),
]);

export type ListArtworkQueueQuery = z.infer<typeof listArtworkQueueQuerySchema>;
export type ModerateArtworkInput = z.infer<typeof moderateArtworkSchema>;
