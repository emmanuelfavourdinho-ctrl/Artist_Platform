import { z } from 'zod';

export const createConversationSchema = z.object({
  artistId: z.string().uuid(),
  artworkId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  commissionRequestId: z.string().uuid().optional(),
});

export const sendMessageSchema = z.object({
  id: z.string().uuid().optional(),
  body: z.string().trim().max(5000).optional(),
  attachment: z.object({
    publicId: z.string().min(1).max(512),
    secureUrl: z.string().url(),
    resourceType: z.enum(['image', 'video']),
    format: z.enum(['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'webm', 'mp3', 'm4a', 'mp4', 'ogg', 'opus', 'wav', 'aac', 'flac']),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/flac', 'audio/opus']),
    bytes: z.number().int().positive().max(20_000_000),
    version: z.number().int().positive(),
    signature: z.string().regex(/^[a-f0-9]{40}$/i),
    name: z.string().trim().min(1).max(255),
  }).strict().optional(),
}).strict().superRefine((message, ctx) => {
  if (!message.body && !message.attachment) {
    ctx.addIssue({ code: 'custom', path: ['body'], message: 'Write a message or attach a file.' });
  }
  if (message.attachment) {
    const isAudio = message.attachment.mimeType.startsWith('audio/');
    if ((isAudio && message.attachment.resourceType !== 'video') || (!isAudio && message.attachment.resourceType !== 'image')) {
      ctx.addIssue({ code: 'custom', path: ['attachment', 'resourceType'], message: 'The attachment type does not match its media.' });
    }
  }
});

export const reportConversationSchema = z.object({
  reason: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional(),
}).strict();

export const editMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
}).strict();

export const pinMessageSchema = z.object({
  pinned: z.boolean(),
}).strict();
