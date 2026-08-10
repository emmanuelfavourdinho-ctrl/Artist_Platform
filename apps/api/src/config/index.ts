import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('4000'),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  API_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().optional(),
});

const env = envSchema.parse(process.env);

export const config = {
  port: Number(env.PORT),
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  apiUrl: env.API_URL,
  corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:3000',
};
