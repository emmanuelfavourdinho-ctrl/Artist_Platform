import { z } from 'zod';

const httpsUrl = z.string().trim().url().max(2_048).refine((value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}, 'Tracking URL must use HTTPS');

const evidenceReferences = z.array(z.string().trim().min(1).max(512)).max(10).default([]);

export const shipOrderSchema = z.object({
  carrier: z.string().trim().min(2).max(100),
  trackingReference: z.string().trim().min(1).max(255),
  trackingUrl: httpsUrl.optional(),
  evidenceReferences,
});

export const updateTrackingSchema = z.object({
  carrier: z.string().trim().min(2).max(100),
  trackingReference: z.string().trim().min(1).max(255),
  trackingUrl: httpsUrl.optional(),
  evidenceReferences,
  reason: z.string().trim().min(10).max(500),
});

export const confirmReceiptSchema = z.object({
  confirmation: z.literal('RECEIVED_IN_GOOD_CONDITION'),
});

export const createDeliveryDisputeSchema = z.object({
  reason: z.enum(['NOT_RECEIVED', 'DAMAGED', 'WRONG_ITEM', 'OTHER']),
  description: z.string().trim().min(10).max(2_000),
  evidenceReferences,
});

export const resolveDeliveryDisputeSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  resolutionNote: z.string().trim().min(10).max(1_000),
});

export const artistDisputeResponseSchema = z.object({
  response: z.string().trim().min(10).max(2_000),
  evidenceReferences,
});

export const releaseHoldSchema = z.object({
  held: z.boolean(),
  reason: z.string().trim().min(10).max(500),
});

export type ShipOrderInput = z.infer<typeof shipOrderSchema>;
export type UpdateTrackingInput = z.infer<typeof updateTrackingSchema>;
export type CreateDeliveryDisputeInput = z.infer<typeof createDeliveryDisputeSchema>;
export type ResolveDeliveryDisputeInput = z.infer<typeof resolveDeliveryDisputeSchema>;
export type ArtistDisputeResponseInput = z.infer<typeof artistDisputeResponseSchema>;
