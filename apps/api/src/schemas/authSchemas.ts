import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().email('Not a valid email address').toLowerCase(),
  // 8 char minimum is a floor, not a strength guarantee — pair with a
  // breached-password check (e.g. HaveIBeenPwned's k-anonymity API) if
  // you want real protection against credential-stuffing later. The 128
  // cap is the same bcrypt-DoS guard used on the login schema.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
  firstName: z.string().trim().min(1, 'First name is required').max(80, 'First name is too long'),
  lastName: z.string().trim().min(1, 'Last name is required').max(80, 'Last name is too long'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email('Not a valid email address').toLowerCase(),
  // No complexity/length-floor rules here on purpose — see the note on
  // adminLoginSchema in reviewSchemas.ts: revealing password policy on
  // a login form helps attackers, not users.
  password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
});

export type LoginInput = z.infer<typeof loginSchema>;
