import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/httpError.js';

export function requireArtist(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.roles.some((role) => role === 'ARTIST' || role === 'ADMIN')) {
    next(new HttpError(403, 'Artist privileges required', { code: 'ARTIST_ROLE_REQUIRED' }));
    return;
  }
  next();
}
