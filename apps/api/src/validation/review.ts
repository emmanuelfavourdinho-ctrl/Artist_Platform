import { z } from 'zod';

/*
  Explainer: authorName/authorEmail are gone on purpose. Under the real
  schema, a review belongs to an authenticated User (req.user, attached
  by requireAuth) — the reviewer's identity is never something the
  client gets to state in the request body, the same way submitReview
  never lets the client set `status`.
*/
export const submitReviewSchema = z.object({
  rating: z
    .number()
    .int('Rating must be a whole number')
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating must be at most 5'),
  title: z.string().trim().max(120, 'Title is too long').optional(),
  comment: z.string().trim().min(10, 'Review is too short').max(1000, 'Review is too long'),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

export const moderateReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500, 'Reason is too long').optional(),
});

export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;
