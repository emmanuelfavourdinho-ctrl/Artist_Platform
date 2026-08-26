import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redis from '../config/redis.js';

/*
  Explainer: rate limiting answers the question "how many times can the
  SAME visitor hit this specific endpoint in a short window of time?"
  Without it, one person (or a bot) could submit hundreds of fake
  reviews in seconds — flooding the admin's moderation queue and making
  it impractical to review real feedback. This limits any single visitor
  to 5 review submissions per 15 minutes; a genuine customer leaving one
  honest review is completely unaffected, while a spam attempt hits a
  wall almost immediately.

  Note this is layered on TOP of admin approval, not instead of it —
  even a submission that gets through rate limiting still starts as
  PENDING and stays invisible until an admin approves it. Rate limiting
  protects the moderation queue itself from being flooded; approval
  protects the public page from ever showing something unapproved.

  Store: by default express-rate-limit keeps counts in the process's own
  memory. That's fine for a single instance, but in a horizontally
  scaled deployment (2+ instances behind a load balancer, which is the
  norm in production) each instance would keep an independent counter —
  silently multiplying the effective limit by the instance count, since
  a visitor's requests land on different instances. Backing the counter
  with Redis (the same client already used elsewhere in the app) makes
  the limit authoritative across every instance. Requires the app to
  have called connectRedis() before traffic starts (already the case —
  see server.ts).
*/
export const reviewRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: Number(process.env.REVIEW_RATE_LIMIT_MAX ?? 5),
  standardHeaders: true, // tells the caller their remaining quota via response headers
  legacyHeaders: false,
  // Skip entirely in tests: these tests exercise business logic (auth,
  // validation, status codes), not rate-limiting itself, and a shared
  // in-memory counter across every test in the same process would make
  // later tests fail from earlier tests' request counts — a form of
  // test pollution that has nothing to do with the code being tested.
  // Rate-limiting behavior itself belongs in its own dedicated test.
  skip: () => process.env.NODE_ENV === 'test',
  store:
    process.env.NODE_ENV === 'test'
      ? undefined
      : new RedisStore({
          prefix: 'rl:reviews:',
          sendCommand: (...args: string[]) => redis.sendCommand(args),
        }),
  message: {
    status: 'error',
    message: 'Too many reviews submitted recently. Please try again later.',
  },
});
