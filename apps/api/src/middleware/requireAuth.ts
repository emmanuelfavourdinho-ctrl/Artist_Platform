import type { NextFunction, Request, Response } from 'express';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { reinstateIfExpired } from '../services/enforcementService.js';

// Account states that cannot use ANY authenticated endpoint. (/auth/sync
// does its own token verification, so these users can still sign in and
// be told why — see the account status page.)
const BLOCKED_STATUSES: Record<string, { code: string; message: string }> = {
  SUSPENDED: { code: 'ACCOUNT_SUSPENDED', message: 'This account is suspended' },
  BANNED: { code: 'ACCOUNT_BANNED', message: 'This account has been banned' },
  DEACTIVATED: { code: 'ACCOUNT_DEACTIVATED', message: 'This account is deactivated' },
};

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new HttpError(401, 'Login required', { code: 'AUTH_REQUIRED' }));
    }

    const token = authHeader.split('Bearer ')[1];
    if (!token) {
      return next(new HttpError(401, 'Login required', { code: 'AUTH_REQUIRED' }));
    }
    const decodedToken = await adminAuth.verifyIdToken(token);

    const user = await prisma.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
      include: { roles: { include: { role: true } } },
    });

    if (!user) {
      return next(
        new HttpError(401, 'User account not synchronized in database', { code: 'USER_NOT_FOUND' }),
      );
    }

    let status: string | undefined = user.status;

    // A temporary restriction/suspension whose end date has passed is
    // lifted here, on the user's own next request, rather than relying on
    // a scheduler that could fail without anyone noticing.
    if (status === 'RESTRICTED' || status === 'SUSPENDED') {
      if (await reinstateIfExpired(user.id)) status = 'ACTIVE';
    }

    const blocked = status ? BLOCKED_STATUSES[status] : undefined;
    if (blocked) {
      return next(new HttpError(403, blocked.message, { code: blocked.code }));
    }

    req.user = {
      id: user.id,
      email: user.email,
      roles: user.roles.map((r) => r.role.name),
      status,
    };

    next();
  } catch {
    next(new HttpError(401, 'Session is invalid or has expired', { code: 'SESSION_INVALID' }));
  }
}
