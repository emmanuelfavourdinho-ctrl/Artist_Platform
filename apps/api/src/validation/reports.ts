import { z } from 'zod';

const targetSlug = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid target');

export const createReportSchema = z.object({
  targetType: z.enum(['USER', 'ARTWORK']),
  // Public artist/artwork slugs let users select a visible subject without
  // copying internal database identifiers. The API stores the canonical id.
  targetSlug,
  reason: z.string().trim().min(3, 'Please describe the issue').max(120),
  description: z.string().trim().max(2000).optional(),
});

export const listReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['OPEN', 'PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED']).optional(),
});

export const updateReportSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('REVIEWING') }),
  z.object({
    status: z.literal('RESOLVED'),
    resolutionNote: z
      .string()
      .trim()
      .min(10, 'A resolution note of at least 10 characters is required')
      .max(1000),
  }),
  z.object({
    status: z.literal('DISMISSED'),
    resolutionNote: z
      .string()
      .trim()
      .min(10, 'A resolution note of at least 10 characters is required')
      .max(1000),
  }),
]);

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
export type UpdateReportInput = z.infer<typeof updateReportSchema>;
