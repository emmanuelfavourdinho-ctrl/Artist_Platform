import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().email('Not a valid email address').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
  firstName: z.string().trim().min(1, 'First name is required').max(80, 'First name is too long'),
  lastName: z.string().trim().min(1, 'Last name is required').max(80, 'Last name is too long'),
  // The client states an INTENT, never a role — the server decides what
  // that intent actually grants (see register() in authController.ts).
  // This is what keeps `{ role: "ADMIN" }` un-submittable by construction:
  // there's no field for it, not even one the server ignores.
  intent: z.enum(['ARTIST', 'BUYER'], {
    errorMap: () => ({ message: 'Choose whether you want to buy or sell art' }),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email('Not a valid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
});

export type LoginInput = z.infer<typeof loginSchema>;
