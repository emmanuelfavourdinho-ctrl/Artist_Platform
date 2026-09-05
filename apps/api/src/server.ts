import type { Server } from 'node:http';
import { config } from './config/index.js';
import { connectRedis, disconnectRedis, pingRedis } from './config/redis.js';

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

const PORT = Number(config.port ?? 4000);
if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  logger.error(`Invalid PORT configuration: ${config.port}`);
  process.exit(1);
}

const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000);
const STARTUP_TIMEOUT_MS = Number(process.env.STARTUP_TIMEOUT_MS ?? 15_000);

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
    await withTimeout(connectRedis(), STARTUP_TIMEOUT_MS, 'Redis connection');

    /*
      Explainer: this dynamic import() is the actual fix, and WHERE it
      sits matters enormously.

      Before: `import { app } from './app.js';` sat at the very top of
      this file, as a normal "static" import. In JavaScript, ALL static
      imports in a file are resolved and fully executed BEFORE any of
      that file's own code runs — including before the very first line
      of startServer() ever gets a chance to call connectRedis().

      './app.js' pulls in './routes/index.js', which pulls in
      'authRoutes.js' and the review routes, which each pull in
      'authRateLimiter.js' / 'reviewRateLimiter.js'. Both of THOSE files
      build their rate limiter the instant they're loaded:

        export const authRateLimiter = rateLimit({
          ...
          store: new RedisStore({ ... }),
        });

      Building that RedisStore immediately tries to talk to Redis (to
      load a small Lua script it needs). So the old order was:

        1. Import app.js (transitively loads authRateLimiter.js,
           which immediately tries to use Redis — but Redis hasn't
           been told to connect yet at this point!)
        2. NOW run connectRedis()
        3. Start listening for requests

      Step 1 was racing step 2 and losing, every single time — that's
      exactly the "ClientClosedError: The client is closed" warning
      you saw at startup.

      After: by moving the import of app.js INTO an async import()
      call, right here, AFTER connectRedis() has already been awaited,
      we guarantee the entire chain (app -> routes -> rate limiters)
      only loads once Redis is already connected and ready. Same code,
      same files, just started in the correct order:

        1. connectRedis() — wait for this to fully finish
        2. NOW import app.js (rate limiters build successfully, Redis
           is already there waiting for them)
        3. Start listening for requests
    */
    const { app } = await import('./app.js');

    server = app.listen(PORT);

    await new Promise<void>((resolve, reject) => {
      server!.once('listening', () => resolve());
      server!.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${PORT} is already in use`));
        } else {
          reject(err);
        }
      });
    });

    logger.info(`API server listening on http://localhost:${PORT}`);

    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start API server', error);
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.warn(`Received ${signal}. Initiating graceful shutdown...`);

  const forceExitTimer = setTimeout(() => {
    logger.error('Could not close connections in time, forcing shutdown');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  try {
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

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
  if (!isShuttingDown) void shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  if (!isShuttingDown) void shutdown('uncaughtException');
});

export async function isReady(): Promise<boolean> {
  if (!server || !server.listening || isShuttingDown) return false;
  return pingRedis();
}

startServer();
