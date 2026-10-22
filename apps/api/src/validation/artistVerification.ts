import { z } from 'zod';
import { VERIFICATION_FIELD_TYPES } from '../lib/verificationFields.js';

/*
  Explainer: every schema here is .strict(). A plain z.object() silently
  DROPS unknown keys, which would let a payload carrying `status`,
  `artistId`, `requestedBy` or `verificationStatus` pass validation and
  look accepted. .strict() turns any such key into a 400 instead, so the
  only inputs that exist are the ones listed.
*/

const reason = z
  .string()
  .trim()
  .min(10, 'Please give a reason of at least 10 characters')
  .max(1000, 'Reason is too long');

export const queueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().min(1).max(100).optional(),
  state: z.enum(['NO_ACTIVE_REQUEST', 'AWAITING_ARTIST_INPUT', 'AWAITING_REVIEW']).optional(),
});
export type QueueQuery = z.infer<typeof queueQuerySchema>;

export const createInfoRequestSchema = z
  .object({
    message: z.string().trim().max(1000, 'Message is too long').optional(),
    fields: z
      .array(
        z
          .object({
            type: z.enum(VERIFICATION_FIELD_TYPES),
            label: z.string().trim().min(1).max(100).optional(),
            instructions: z.string().trim().min(1, 'Add instructions for the artist').max(500),
            required: z.boolean(),
          })
          .strict(),
      )
      .min(1, 'Request at least one field')
      .max(VERIFICATION_FIELD_TYPES.length),
  })
  .strict()
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.fields.forEach((field, index) => {
      if (seen.has(field.type)) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', index, 'type'],
          message: 'Each field can only be requested once per request',
        });
      }
      seen.add(field.type);
    });
  });
export type CreateInfoRequestInput = z.infer<typeof createInfoRequestSchema>;

export const cancelRequestSchema = z.object({ reason }).strict();
export type CancelRequestInput = z.infer<typeof cancelRequestSchema>;

export const decisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: z.string().trim().max(1000, 'Reason is too long').optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.decision === 'REJECT' && (data.reason?.length ?? 0) < 10) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'A reason of at least 10 characters is required to reject an application',
      });
    }
  });
export type DecisionInput = z.infer<typeof decisionSchema>;

export const submitResponseSchema = z
  .object({
    responses: z
      .array(
        z
          .object({
            fieldId: z.string().trim().min(1).max(50),
            // Per-type length limits are enforced against the stored
            // request; this is only a payload-size ceiling.
            value: z.string().max(6000),
          })
          .strict(),
      )
      .max(VERIFICATION_FIELD_TYPES.length),
  })
  .strict();
export type SubmitResponseInput = z.infer<typeof submitResponseSchema>;

export const markNotificationsReadSchema = z
  .object({ notificationIds: z.array(z.string().uuid()).min(1).max(100).optional() })
  .strict();
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;
