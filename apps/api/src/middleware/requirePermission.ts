import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/httpError.js';
import { hasPermission, type Permission } from '../lib/permissions.js';
import { requireAuth } from './requireAuth.js';

/*
  Explainer: authenticate first (valid Firebase session, account in good
  standing, req.user attached), then require ONE specific permission.
  Replaces the blunt `requireAdmin` for admin endpoints so access can be
  split by duty. A user with no matching permission gets 403 and the
  controller never runs.
*/
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    requireAuth(req, res, (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }
      if (!req.user || !hasPermission(req.user.roles, permission)) {
        next(
          new HttpError(403, 'You do not have permission to perform this action', {
            code: 'PERMISSION_DENIED',
          }),
        );
        return;
      }
      next();
    });
  };
}
