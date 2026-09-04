import { z } from 'zod';

// Strips ASCII control characters (including null bytes) that have no
// business being in free-text input — cheap hygiene against corrupted
// storage/rendering, independent of HTML/XSS escaping (which still must
// happen at render time, not here).

// entire job is matching control characters, so the rule's warning does
// not apply here the way it would in an accidental match.
const stripControlChars = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, '');

/*
    Explainer: this is a checklist our server runs every incoming review
    submission through BEFORE it ever gets near the database. If a
    submission fails any rule here, it's rejected immediately with a clear
    error — the database, and every other part of the app, only ever sees
    data that's already known to be well-formed. This is the single most
    important defense against both honest mistakes (a typo'd email) and
    deliberate abuse (someone trying to submit a 50,000-character comment
    to disrupt the site).
    */
export const submitReviewSchema = z.object({
  authorName: z
    .string()
    .trim()
    .min(2, 'Name is too short')
    .max(80, 'Name is too long')
    .transform(stripControlChars),
  // Lowercased so "Jane@Example.com" and "jane@example.com" aren't
  // treated as different reviewers — matters if this address is later
  // used for lookups (e.g. "have I already reviewed this?") or dedup.
  authorEmail: z.string().trim().email('Not a valid email address').toLowerCase(),
  rating: z
    .number()
    .int('Rating must be a whole number')
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating must be at most 5'),
  comment: z
    .string()
    .trim()
    .min(10, 'Review is too short')
    .max(1000, 'Review is too long')
    .transform(stripControlChars),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

/*
    Explainer: this one validates the OTHER direction — when an admin
    clicks approve/reject, we check that the request actually says
    "approve" or "reject" and nothing else. z.enum() is the TypeScript/Zod
    version of the ReviewStatus enum we defined in the database — this is
    what stops a malformed or malicious request from ever reaching the
    database update itself.
    */
export const moderateReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;

export const adminLoginSchema = z.object({
  email: z.string().trim().email('Not a valid email address').toLowerCase(),
  // Deliberately no complexity rules here — that belongs at account
  // creation time, not login (revealing password policy on a login form
  // helps attackers, not users). The upper bound isn't about strength,
  // it's a DoS guard: bcrypt/argon2 silently truncate or slow down on
  // very long inputs, so an attacker sending a multi-KB "password"
  // shouldn't get to burn extra CPU on every hash comparison.
  password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
