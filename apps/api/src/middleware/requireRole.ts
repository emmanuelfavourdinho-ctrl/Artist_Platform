import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/httpError.js';

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    // requireAuth must run BEFORE this middleware — it's what sets req.user.
    if (!req.user) {
      return next(new HttpError(401, 'Login required', { code: 'AUTH_REQUIRED' }));
    }
    const hasRole = req.user.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      return next(
        new HttpError(403, 'You do not have permission to access this resource', {
          code: 'FORBIDDEN',
        }),
      );
    }
    next();
  };
}
