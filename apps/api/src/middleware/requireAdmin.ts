import type { NextFunction, Request, Response } from 'express';
import { requireAuth } from './requireAuth.js';
import { HttpError } from '../lib/httpError.js';

const ADMIN_ROLE = 'ADMIN';

/*
  Explainer: there is no separate Admin table — per schema.prisma, admin
  is just a User whose roles include 'ADMIN' (via Role/UserRole). This
  middleware runs the normal auth check first (valid session, attaches
  req.user), then adds one more gate on top: does this user's role list
  actually include ADMIN? Both checks must pass before an admin-only
  route's controller ever runs.
*/
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }

    if (!req.user?.roles.includes(ADMIN_ROLE)) {
      next(new HttpError(403, 'Admin privileges required', { code: 'ADMIN_ROLE_REQUIRED' }));
      return;
    }

    next();
  });
}
