import { z } from 'zod';

export const createCommunityPostSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(20).max(5000),
  artworkId: z.string().uuid().optional(),
  imageUrl: z.string().url().optional(),
});
