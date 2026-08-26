import type { Server } from 'node:http';
import { app } from './app.js';
import { config } from './config/index.js';
import { connectRedis, disconnectRedis, pingRedis } from './config/redis.js';

/* ------------------------------------------------------------------ */
/* Logging                                                             */
/* ------------------------------------------------------------------ */
// Structured JSON so log lines are parseable by log aggregators
// (Datadog, CloudWatch, ELK, etc). Swap for pino/winston if the app
// already standardizes on one — keep the shape (level/msg/ts) the same.

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

const logger: Logger = {
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

/* ------------------------------------------------------------------ */
/* Config                                                               */
/* ------------------------------------------------------------------ */

const PORT = Number(config.port ?? 3000);
if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  logger.error(`Invalid PORT configuration: ${config.port}`);
  process.exit(1);
}

const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000);
const STARTUP_TIMEOUT_MS = Number(process.env.STARTUP_TIMEOUT_MS ?? 15_000);

/* ------------------------------------------------------------------ */
/* Startup                                                              */
/* ------------------------------------------------------------------ */

let server: Server | undefined;
let isShuttingDown = false;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function startServer(): Promise<void> {
  try {
    // 1. Initialize external dependencies first, bounded so a hung
    //    dependency can't stall the process forever on boot.
    await withTimeout(connectRedis(), STARTUP_TIMEOUT_MS, 'Redis connection');

    // 2. Start the HTTP server. Attach the error listener before the
    //    callback fires so bind failures (e.g. EADDRINUSE) are caught.
    server = app.listen(PORT);

    await new Promise<void>((resolve, reject) => {
      server!.once('listening', () => resolve());
      server!.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${PORT} is already in use`));
        } else {
          reject(err);
        }
      });
    });

    logger.info(`API server listening on http://localhost:${PORT}`);

    // 3. Signal handlers — registered once startup actually succeeds,
    //    so a failed boot doesn't leave half-initialized shutdown hooks.
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start API server', error);
    process.exit(1);
  }
}

/* ------------------------------------------------------------------ */
/* Graceful shutdown                                                    */
/* ------------------------------------------------------------------ */

async function shutdown(signal: string): Promise<void> {
  // Guard against duplicate signals (e.g. a second Ctrl+C, or SIGTERM
  // arriving while SIGINT is already being handled) re-entering the
  // teardown path and racing itself.
  if (isShuttingDown) {
    logger.warn(`Received ${signal} during shutdown, ignoring duplicate signal`);
    return;
  }
  isShuttingDown = true;
  logger.warn(`Received ${signal}. Initiating graceful shutdown...`);

  const forceExitTimer = setTimeout(() => {
    logger.error('Could not close connections in time, forcing shutdown');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  try {
    // Stop accepting new HTTP connections first, then tear down
    // dependencies once in-flight requests have drained.
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
      logger.info('HTTP server closed');
    }

    await disconnectRedis();

    logger.info('All connections closed cleanly');
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', err);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

/* ------------------------------------------------------------------ */
/* Process-level error traps                                            */
/* ------------------------------------------------------------------ */
// These indicate the process is in an unknown/corrupted state, so the
// only safe move is to attempt a bounded graceful shutdown and exit —
// never keep serving traffic after one of these fires.

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
  // TODO: forward to APM/error tracker (Sentry, Datadog, etc.) here.
  if (!isShuttingDown) {
    void shutdown('unhandledRejection');
  }
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  // TODO: forward to APM/error tracker (Sentry, Datadog, etc.) here.
  if (!isShuttingDown) {
    void shutdown('uncaughtException');
  }
});

/* ------------------------------------------------------------------ */
/* Optional: expose readiness for orchestrators (k8s, ECS, etc.)        */
/* ------------------------------------------------------------------ */

export async function isReady(): Promise<boolean> {
  if (!server || !server.listening || isShuttingDown) return false;
  return pingRedis();
}

startServer();
