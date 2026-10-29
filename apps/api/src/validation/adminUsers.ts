import { z } from 'zod';
import { STAFF_ROLES } from '../lib/permissions.js';

const MAX_TEMPORARY_DAYS = 365;

const reason = z
  .string()
  .trim()
  .min(10, 'Please give a reason of at least 10 characters')
  .max(1000, 'Reason is too long');

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().min(1).max(100).optional(),
  status: z
    .enum(['ACTIVE', 'PENDING_VERIFICATION', 'RESTRICTED', 'SUSPENDED', 'BANNED', 'DEACTIVATED'])
    .optional(),
  role: z.enum(['BUYER', 'ARTIST', ...STAFF_ROLES]).optional(),
  sort: z.enum(['createdAt', 'email', 'lastName']).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/*
  Explainer: `reason` is mandatory for every enforcement action — the
  brief's "record why" rule enforced at the door, not trusted to the UI.
  An end date is only meaningful for restrictions/suspensions, must be in
  the future, and is capped so a "temporary" measure cannot silently be
  permanent.
*/
export const enforcementBodySchema = z
  .object({
    action: z.enum(['WARNING', 'RESTRICT', 'SUSPEND', 'BAN', 'REINSTATE']),
    reason,
    expiresAt: z.coerce.date().optional(),
    reportId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.expiresAt) return;
    const now = Date.now();
    if (data.expiresAt.getTime() <= now) {
      ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'End date must be in the future' });
    } else if (data.expiresAt.getTime() > now + MAX_TEMPORARY_DAYS * 86_400_000) {
      ctx.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: `End date cannot be more than ${MAX_TEMPORARY_DAYS} days away`,
      });
    }
  });
export type EnforcementBody = z.infer<typeof enforcementBodySchema>;

export const staffRoleBodySchema = z.object({
  role: z.enum(STAFF_ROLES),
  operation: z.enum(['GRANT', 'REVOKE']),
  reason,
});
export type StaffRoleBody = z.infer<typeof staffRoleBodySchema>;

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  action: z
    .enum([
      'USER_ROLE_UPDATED',
      'ARTIST_VERIFICATION_CHANGED',
      'ORDER_STATUS_CHANGED',
      'ARTWORK_MODERATED',
      'SYSTEM_SETTING_CHANGED',
      'REVIEW_APPROVED',
      'REVIEW_REJECTED',
      'USER_STATUS_CHANGED',
      'USER_WARNED',
      'REPORT_REVIEWED',
      'CONTACT_MESSAGE_STATUS_CHANGED',
    ])
    .optional(),
  entityType: z.string().trim().min(1).max(50).optional(),
  entityId: z.string().trim().min(1).max(100).optional(),
  actorId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
