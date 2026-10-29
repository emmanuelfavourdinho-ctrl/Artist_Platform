import { z } from 'zod';

const idempotencyKey = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const reason = z.string().trim().min(10).max(500);

const dateRange = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  reference: z.string().trim().min(1).max(255).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

const validDateRange = (query: { from?: Date; to?: Date }) =>
  !query.from || !query.to || query.from <= query.to;

export const listRefundsQuerySchema = z.object({
  ...dateRange,
  status: z.enum([
    'REQUESTED', 'APPROVED', 'REJECTED', 'SUBMITTED', 'PENDING', 'SUCCEEDED',
    'FAILED', 'MANUAL_RECONCILIATION',
  ]).optional(),
}).refine(validDateRange, { path: ['to'], message: 'End date must be on or after start date' });

export const listPayoutsQuerySchema = z.object({
  ...dateRange,
  status: z.enum([
    'REQUESTED', 'APPROVED', 'REJECTED', 'SUBMITTED', 'PENDING', 'SUCCEEDED',
    'FAILED', 'MANUAL_RECONCILIATION',
  ]).optional(),
}).refine(validDateRange, { path: ['to'], message: 'End date must be on or after start date' });

export const eligiblePayoutsQuerySchema = z.object(dateRange)
  .refine(validDateRange, { path: ['to'], message: 'End date must be on or after start date' });

export const createRefundSchema = z.object({
  paymentId: z.string().uuid(),
  amountMinorUnits: z.string().regex(/^[1-9]\d{0,17}$/),
  reason,
  idempotencyKey,
});

export const decideFinancialOperationSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason,
});

export const retryFinancialOperationSchema = z.object({ reason });

export const createArtistPayoutSchema = z.object({
  fulfillmentId: z.string().uuid(),
  idempotencyKey,
});

export type ListRefundsQuery = z.infer<typeof listRefundsQuerySchema>;
export type ListPayoutsQuery = z.infer<typeof listPayoutsQuerySchema>;
export type EligiblePayoutsQuery = z.infer<typeof eligiblePayoutsQuerySchema>;
