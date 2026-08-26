import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redis from '../config/redis.js';

/*
  Explainer: brute-forcing a password is exactly "try many requests
  fast" — the same shape of problem the review limiter solves, just
  against a more valuable target. 10 attempts per 15 minutes per IP is
  tight enough to make guessing impractical while still generous enough
  that a person who mistypes their password a few times isn't locked
  out. This is layered on top of bcrypt's built-in slowness, not a
  replacement for it — the two defenses cover different attack shapes
  (many-fast-requests vs. computationally-cheap-guessing).
*/
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  store:
    process.env.NODE_ENV === 'test'
      ? undefined
      : new RedisStore({
          prefix: 'rl:auth:',
          sendCommand: (...args: string[]) => redis.sendCommand(args),
        }),
  message: {
    status: 'error',
    message: 'Too many attempts. Please try again later.',
  },
});
