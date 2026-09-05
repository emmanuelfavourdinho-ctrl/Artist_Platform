import { z } from 'zod';

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100).optional(),
  lastName: z.string().trim().min(1, 'Last name is required').max(100).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
