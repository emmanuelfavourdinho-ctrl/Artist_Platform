import { z } from 'zod';

const reference = z.string().trim().min(1).max(255).optional();
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Currency must be a three-letter code')
  .optional();

const dateRange = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  currency,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  reference,
};

const validDateRange = (query: { from?: Date; to?: Date }) =>
  !query.from || !query.to || query.from <= query.to;

export const listAdminOrdersQuerySchema = z
  .object({
    ...dateRange,
    status: z
      .enum([
        'PENDING',
        'CONFIRMED',
        'PROCESSING',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED',
        'REFUNDED',
        'PARTIALLY_REFUNDED',
      ])
      .optional(),
  })
  .refine(validDateRange, {
    path: ['to'],
    message: 'End date must be on or after start date',
  });

export const listAdminPaymentsQuerySchema = z
  .object({
    ...dateRange,
    status: z
      .enum([
        'PENDING',
        'PROCESSING',
        'SUCCEEDED',
        'FAILED',
        'CANCELLED',
        'REFUNDED',
        'PARTIALLY_REFUNDED',
      ])
      .optional(),
  })
  .refine(validDateRange, {
    path: ['to'],
    message: 'End date must be on or after start date',
  });

export type ListAdminOrdersQuery = z.infer<typeof listAdminOrdersQuerySchema>;
export type ListAdminPaymentsQuery = z.infer<typeof listAdminPaymentsQuerySchema>;
