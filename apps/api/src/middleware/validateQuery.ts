import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

import { HttpError } from '../lib/httpError.js';

/*
        Explainer: same factory pattern as validateBody, but validates
        req.query instead — needed anywhere a GET endpoint takes filters,
        sorting, or pagination (e.g. GET /artworks?category=painting&sort=newest).

        Note: this assigns to req.query directly, which is safe under Express 4
        (confirmed in package.json) but NOT under Express 5, where req.query
        became a read-only getter. If this project ever upgrades to Express 5,
        this assignment needs to change to attaching a separate property
        (e.g. req.validatedQuery) instead.
        */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue
        ? firstIssue.path.length
          ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
          : firstIssue.message
        : 'Invalid query parameters';

      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      next(new HttpError(400, message, { code: 'VALIDATION_ERROR', details }));
      return;
    }

    req.query = result.data as unknown as Request['query'];
    next();
  };
}
