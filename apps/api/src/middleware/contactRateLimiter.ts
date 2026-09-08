import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redis from '../config/redis.js';

/*
  Explainer: a public, unauthenticated form is exactly the kind of
  endpoint spam scripts target — 5 submissions per hour per IP is
  generous for a genuine visitor (nobody legitimately submits a contact
  form 6 times in an hour) while making automated spam impractical.
*/
export const contactRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.CONTACT_RATE_LIMIT_MAX ?? 5),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  store:
    process.env.NODE_ENV === 'test'
      ? undefined
      : new RedisStore({
          prefix: 'rl:contact:',
          sendCommand: (...args: string[]) => redis.sendCommand(args),
        }),
  message: {
    status: 'error',
    message: 'Too many messages sent. Please try again later.',
  },
});
