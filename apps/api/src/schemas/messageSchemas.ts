import { z } from 'zod';

export const createConversationSchema = z.object({
  artistId: z.string().uuid(),
  artworkId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  commissionRequestId: z.string().uuid().optional(),
});

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  attachmentUrl: z.string().url().optional(),
  attachmentType: z.string().max(100).optional(),
  attachmentName: z.string().max(255).optional(),
  attachmentSize: z.number().int().positive().max(50_000_000).optional(),
});
