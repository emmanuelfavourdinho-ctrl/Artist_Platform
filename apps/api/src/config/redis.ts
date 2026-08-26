import { createClient, type RedisClientType } from 'redis';

/* ------------------------------------------------------------------ */
/* Logging                                                             */
/* ------------------------------------------------------------------ */

interface Logger {
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
}

function toMeta(meta: unknown): Record<string, unknown> {
  if (!meta) return {};
  if (meta instanceof Error) return { error: meta.message, stack: meta.stack };
  return { meta };
}

// Structured JSON logging by default so log lines are parseable by
// log aggregators (Datadog, CloudWatch, etc). Swap in your app logger
// (pino/winston) via setRedisLogger() — don't hardcode console in prod.
const defaultLogger: Logger = {
  info: (msg, meta) =>
    console.log(
      JSON.stringify({ level: 'info', msg, ts: new Date().toISOString(), ...toMeta(meta) }),
    ),
  warn: (msg, meta) =>
    console.warn(
      JSON.stringify({ level: 'warn', msg, ts: new Date().toISOString(), ...toMeta(meta) }),
    ),
  error: (msg, meta) =>
    console.error(
      JSON.stringify({ level: 'error', msg, ts: new Date().toISOString(), ...toMeta(meta) }),
    ),
};

let logger: Logger = defaultLogger;

/** Inject your application's logger (pino, winston, etc). */
export function setRedisLogger(customLogger: Logger): void {
  logger = customLogger;
}

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  // Fail fast at startup rather than surfacing a confusing error on first use.
  throw new Error('REDIS_URL environment variable is required but was not set.');
}

const MAX_RETRIES = Number(process.env.REDIS_MAX_RETRIES ?? 10);
const MAX_BACKOFF_MS = Number(process.env.REDIS_MAX_BACKOFF_MS ?? 3000);
const CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 10000);

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

const redis: RedisClientType = createClient({
  url: REDIS_URL,
  socket: {
    connectTimeout: CONNECT_TIMEOUT_MS,
    reconnectStrategy: (retries) => {
      if (retries > MAX_RETRIES) {
        logger.error(`Redis reconnection retries exhausted after ${retries} attempts`);
        return new Error('Redis connection retries exhausted.');
      }
      // Exponential backoff with jitter to avoid thundering-herd reconnects
      // when many instances lose the connection at the same moment.
      const backoff = Math.min(retries * 100, MAX_BACKOFF_MS);
      const jitter = Math.floor(Math.random() * 100);
      return backoff + jitter;
    },
  },
});

redis.on('error', (err) => logger.error('Redis client error', err));
redis.on('connect', () => logger.info('Redis connecting...'));
redis.on('ready', () => logger.info('Redis connected and ready to use'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));
redis.on('end', () => logger.warn('Redis connection closed'));

/* ------------------------------------------------------------------ */
/* Connect (race-safe)                                                 */
/* ------------------------------------------------------------------ */

// Concurrent callers (e.g. multiple requests hitting a cold serverless
// instance simultaneously) must not each call redis.connect() — node-redis
// throws on a second concurrent connect(). This promise lock ensures only
// one connection attempt is ever in flight.
let connectingPromise: Promise<RedisClientType> | null = null;

export async function connectRedis(): Promise<RedisClientType> {
  if (redis.isReady) return redis;
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    try {
      if (!redis.isOpen) {
        await redis.connect();
      }
      return redis;
    } catch (err) {
      logger.error('Failed to connect to Redis', err);
      throw err;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

/** Lightweight health check for readiness/liveness probes. */
export async function pingRedis(): Promise<boolean> {
  try {
    const client = await connectRedis();
    return (await client.ping()) === 'PONG';
  } catch (err) {
    logger.error('Redis health check failed', err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Shutdown                                                             */
/* ------------------------------------------------------------------ */

let shuttingDown = false;

export async function disconnectRedis(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (redis.isOpen) {
      await redis.quit();
      logger.info('Redis client disconnected gracefully');
    }
  } catch (err) {
    // quit() failed (e.g. socket already broken) — force-close instead
    // of leaving a half-open handle that blocks process exit.
    logger.error('Graceful Redis shutdown failed, forcing disconnect', err);
    redis.disconnect();
  }
}

// Registered once per process. Repeated imports of this module (common in
// test suites and hot-reloading dev servers) would otherwise stack up
// duplicate SIGINT/SIGTERM listeners and trigger Node's MaxListeners warning.
let signalsRegistered = false;

export function registerShutdownHandlers(): void {
  if (signalsRegistered) return;
  signalsRegistered = true;

  const shutdown = (signal: string) => async () => {
    logger.info(`Received ${signal}, shutting down Redis client...`);
    await disconnectRedis();
    process.exit(0);
  };

  process.once('SIGINT', shutdown('SIGINT'));
  process.once('SIGTERM', shutdown('SIGTERM'));
}

// Auto-register for long-running processes (servers, workers). In
// serverless/edge runtimes the platform owns the process lifecycle and
// calling process.exit() there can be actively harmful — opt out with
// REDIS_MANAGE_SIGNALS=false in those environments.
if (process.env.REDIS_MANAGE_SIGNALS !== 'false') {
  registerShutdownHandlers();
}

export default redis;
