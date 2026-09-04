import { z } from 'zod';

const referenceSchema = z.object({
  url: z.string().url(),
  publicId: z.string().min(1).optional(),
  resourceType: z.string().min(1).max(40).default('image'),
  fileName: z.string().max(255).optional(),
  fileType: z.string().max(100).optional(),
  fileSize: z.number().int().positive().max(50_000_000).optional(),
});

export const createCommissionSchema = z.object({
  artistId: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().min(20).max(5000),
  category: z.string().trim().max(100).optional(),
  style: z.string().trim().max(100).optional(),
  dimensions: z.string().trim().max(120).optional(),
  intendedUse: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  budget: z.number().positive().max(1_000_000).optional(),
  currency: z.string().length(3).toUpperCase().default('USD'),
  deadline: z.coerce
    .date()
    .refine((date) => date > new Date(), 'Deadline must be in the future')
    .optional(),
  references: z.array(referenceSchema).max(10).default([]),
});

export const updateCommissionStatusSchema = z.object({
  status: z.enum(['REVIEWING', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
});

export const createProposalSchema = z.object({
  price: z.number().positive().max(1_000_000),
  currency: z.string().length(3).toUpperCase().default('USD'),
  estimatedCompletion: z.coerce.date().optional(),
  revisions: z.number().int().min(0).max(20).optional(),
  deliveryFormat: z.string().trim().max(200).optional(),
  usageRights: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(3000).optional(),
  expiresAt: z.coerce.date().optional(),
});

export const proposalDecisionSchema = z.object({
  status: z.enum(['ACCEPTED', 'DECLINED']),
});
