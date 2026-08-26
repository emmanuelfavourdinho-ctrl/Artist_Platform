import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../lib/httpError.js';

/**
 * Mounted after all routes. Rather than writing its own response, it
 * hands off to errorHandler via next() so 404s get the exact same
 * response shape, request-ID correlation, and logging as every other
 * error — one place defines "what an error response looks like."
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(
    new HttpError(404, `Route ${req.method} ${req.originalUrl} not found`, {
      code: 'NOT_FOUND',
    }),
  );
}
