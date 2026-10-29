import dotenv from 'dotenv';
import { z } from 'zod';

// Tests may point dotenv at an isolated temporary path so importing the app
// never reads a developer's real `.env` file.
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? '.env' });

const isTestEnvironment = process.env.NODE_ENV === 'test';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  API_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().optional(),
  JWT_SECRET: isTestEnvironment
    ? z
        .string()
        .min(32, 'JWT_SECRET must be at least 32 characters long')
        .default('test-jwt-secret-for-local-development-12345')
    : z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  COOKIE_SECRET: isTestEnvironment
    ? z
        .string()
        .min(32, 'COOKIE_SECRET must be at least 32 characters long')
        .default('test-cookie-secret-for-local-development-12345')
    : z.string().min(32, 'COOKIE_SECRET must be at least 32 characters long'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  WEBRTC_STUN_URLS: z.string().optional().default(''),
  WEBRTC_TURN_URLS: z.string().optional().default(''),
  WEBRTC_TURN_SHARED_SECRET: z.string().min(32).optional(),
  WEBRTC_TURN_CREDENTIAL_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),

  FIREBASE_SERVICE_ACCOUNT_BASE64: isTestEnvironment
    ? z
        .string()
        .min(1, 'FIREBASE_SERVICE_ACCOUNT_BASE64 is required')
        .default('eyJ0ZW1wbGF0ZSI6InRlc3QifQ==')
    : z.string().min(1, 'FIREBASE_SERVICE_ACCOUNT_BASE64 is required'),

  TRUST_PROXY: z.enum(['true', 'false']).optional(),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  JSON_BODY_LIMIT: z.string().default('1mb'),

  STRIPE_SECRET_KEY: isTestEnvironment
    ? z.string().min(1, 'STRIPE_SECRET_KEY is required').default('sk_test_placeholder_key')
    : z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  STRIPE_WEBHOOK_SECRET: isTestEnvironment
    ? z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required').default('whsec_test_placeholder_key')
    : z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
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
  cloudinary: {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
  },
  webrtc: {
    stunUrls: env.WEBRTC_STUN_URLS.split(',')
      .map((url) => url.trim())
      .filter(Boolean),
    turnUrls: env.WEBRTC_TURN_URLS.split(',')
      .map((url) => url.trim())
      .filter(Boolean),
    turnSharedSecret: env.WEBRTC_TURN_SHARED_SECRET,
    turnCredentialTtlSeconds: env.WEBRTC_TURN_CREDENTIAL_TTL_SECONDS,
  },
  firebase: {
    serviceAccountBase64: env.FIREBASE_SERVICE_ACCOUNT_BASE64,
  },
  trustProxy:
    env.TRUST_PROXY !== undefined ? env.TRUST_PROXY === 'true' : env.NODE_ENV === 'production',
  rateLimit: {
    max: env.RATE_LIMIT_MAX,
  },
  jsonBodyLimit: env.JSON_BODY_LIMIT,

  stripeSecretKey: env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  frontendUrl: env.FRONTEND_URL,
};
