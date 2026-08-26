import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/httpError.js';

interface ErrorResponseBody {
  status: 'error';
  message: string;
  code?: string;
  details?: unknown;
  requestId?: string;
  stack?: string;
}

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Centralized Express error handler. Must be registered last, after all
 * routes and other middleware. Express recognizes it as an error handler
 * by its four-argument signature — do not drop `next` even though it's
 * only used for the headers-sent delegation case below.
 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  // If a response has already started streaming (e.g. the error occurred
  // after headers were sent), Express's own guidance is to delegate to
  // the default handler rather than attempt a second res.json() — doing
  // so throws ERR_HTTP_HEADERS_SENT and can crash the process.
  if (res.headersSent) {
    return next(err);
  }

  const isHttpError = err instanceof HttpError;
  const isError = err instanceof Error;

  // Support HttpError first, then fall back to common conventions used by
  // libraries in the wild (body-parser, express-rate-limit, etc. attach
  // `.status` or `.statusCode` directly to a plain Error).
  const status = isHttpError
    ? err.status
    : ((err as { status?: number; statusCode?: number } | undefined)?.status ??
      (err as { statusCode?: number } | undefined)?.statusCode ??
      500);

  // Anything under 500 is treated as an expected, client-facing condition
  // (bad input, not found, rate limited) unless a thrown HttpError says
  // otherwise via isOperational. Anything else is an unexpected failure
  // whose details must not reach the client.
  const isOperational = isHttpError ? err.isOperational : status < 500;

  let message = isOperational && isError ? err.message : 'Internal server error';

  // Friendlier message for the most common non-HttpError operational
  // case: malformed JSON bodies thrown synchronously by express.json().
  if (isError && (err as { type?: string }).type === 'entity.parse.failed') {
    message = 'Malformed JSON in request body';
  }

  // Always log the full picture server-side, regardless of what's
  // exposed to the client — this is what actually gets debugged from.
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'request_error',
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status,
      isOperational,
      error: isError ? err.message : String(err),
      stack: isError ? err.stack : undefined,
      ts: new Date().toISOString(),
    }),
  );

  const body: ErrorResponseBody = {
    status: 'error',
    message,
    ...(isHttpError && err.code ? { code: err.code } : {}),
    ...(isHttpError && err.details !== undefined ? { details: err.details } : {}),
    ...(req.id ? { requestId: req.id } : {}),
    // Stack traces are invaluable in dev and a liability in prod —
    // never send them once NODE_ENV=production.
    ...(!isProduction && isError ? { stack: err.stack } : {}),
  };

  res.status(status).json(body);
}
