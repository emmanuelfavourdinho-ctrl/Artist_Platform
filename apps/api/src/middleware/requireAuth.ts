import type { NextFunction, Request, Response } from 'express';
import { verifySessionToken } from '../lib/auth.js';
import { HttpError } from '../lib/httpError.js';

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? 'session_token';

/*
  Explainer: this is the base authentication gate — it answers "is
  someone logged in at all?" and attaches req.user if so. requireAdmin
  builds on top of this rather than duplicating it, since "admin" is
  just "logged in AND has the ADMIN role," not a separate identity
  system.

  Same signed-cookie reasoning as before: cookie-parser only populates
  req.signedCookies once it's verified the cookie's HMAC signature, so a
  client-tampered cookie value never reaches this code at all.
*/
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const raw = req.signedCookies?.[SESSION_COOKIE_NAME];
  const token = typeof raw === 'string' ? raw : undefined;

  if (!token) {
    next(new HttpError(401, 'Login required', { code: 'AUTH_REQUIRED' }));
    return;
  }

  const payload = verifySessionToken(token);

  if (!payload) {
    res.clearCookie(SESSION_COOKIE_NAME);
    next(new HttpError(401, 'Session is invalid or has expired', { code: 'SESSION_INVALID' }));
    return;
  }

  req.user = { id: payload.sub, email: payload.email, roles: payload.roles };
  next();
}
