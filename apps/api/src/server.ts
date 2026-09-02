import type { Server } from 'node:http';
import { app } from './app.js';
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
