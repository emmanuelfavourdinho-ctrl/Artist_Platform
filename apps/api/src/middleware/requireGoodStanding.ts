import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/httpError.js';

/*
  Explainer: a RESTRICTED account may sign in, browse and read its own
  data, but may not create marketplace activity. Apply this AFTER
  requireAuth on every route that creates something other people see or
  that moves money/work (checkout, commissions, messages, reviews,
  posts, artwork). SUSPENDED / BANNED / DEACTIVATED never get this far —
  requireAuth already rejects them.
*/
export function requireGoodStanding(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.status === 'RESTRICTED') {
    next(
      new HttpError(403, 'Your account is restricted and cannot perform this action', {
        code: 'ACCOUNT_RESTRICTED',
      }),
    );
    return;
  }
  next();
}
