import type { NextFunction, Request, Response } from 'express';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';

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

    req.user = {
      id: user.id,
      email: user.email,
      roles: user.roles.map((r) => r.role.name),
    };

    next();
  } catch {
    next(new HttpError(401, 'Session is invalid or has expired', { code: 'SESSION_INVALID' }));
  }
}
