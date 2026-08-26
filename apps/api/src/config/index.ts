import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/*
  Explainer: JWT_SECRET is the "master key" our server uses to sign
  admin login tokens — anyone who obtains this exact string could forge
  a fake "I am the admin" token, so it must be long, random, and never
  committed to GitHub (it lives only in .env, which .gitignore already
  excludes). Unlike DATABASE_URL above, we do NOT give this a fallback
  default — z.string().min(32) below means the server refuses to start
  at all if this isn't set to something reasonably long. That's
  deliberate: a missing secret should be a loud startup crash, never a
  silent "oh well, I'll use something weak instead."

  COOKIE_SECRET follows the exact same philosophy and is deliberately a
  SEPARATE secret from JWT_SECRET — signing admin cookies and signing
  admin JWTs are different trust boundaries, and reusing one secret for
  both means a leak of either purpose compromises both.
*/
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  API_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters long'),

  // Set TRUST_PROXY explicitly to override the production-only default
  // below — e.g. TRUST_PROXY=false if you're running behind something
  // that already strips/rewrites X-Forwarded-For, or TRUST_PROXY=true
  // to trust it in a non-production environment for testing.
  // NOTE: deliberately z.enum(['true','false']) rather than
  // z.coerce.boolean() — Zod's boolean coercion is just Boolean(value),
  // so the string "false" (non-empty) would coerce to `true`. An enum
  // avoids that trap entirely.
  TRUST_PROXY: z.enum(['true', 'false']).optional(),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  JSON_BODY_LIMIT: z.string().default('1mb'),
});

const env = envSchema.parse(process.env);

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  apiUrl: env.API_URL,
  // Comma-separated in .env (CORS_ORIGIN=https://a.com,https://b.com)
  // so multiple front-ends can be allow-listed without code changes.
  corsOrigin: env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : ['http://localhost:3000'],
  jwtSecret: env.JWT_SECRET,
  cookieSecret: env.COOKIE_SECRET,
  trustProxy:
    env.TRUST_PROXY !== undefined ? env.TRUST_PROXY === 'true' : env.NODE_ENV === 'production',
  rateLimit: {
    max: env.RATE_LIMIT_MAX,
  },
  jsonBodyLimit: env.JSON_BODY_LIMIT,
};
