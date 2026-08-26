import type { NextFunction, Request, Response } from 'express';
import { hashPassword, verifyPassword, signSessionToken } from '../lib/auth.js';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { SESSION_COOKIE_NAME } from '../middleware/requireAuth.js';
import { config } from '../config/index.js';
import type { RegisterInput, LoginInput } from '../schemas/authSchemas.js';

const SESSION_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // keep in sync with SESSION_TOKEN_TTL in lib/auth.ts

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    signed: true,
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  });
}

export async function register(
  req: Request<unknown, unknown, RegisterInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password, firstName, lastName } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Deliberately generic: confirming "this email already has an
      // account" to an anonymous caller is a minor account-enumeration
      // leak. Same reasoning applies to login's error message below.
      next(
        new HttpError(409, 'Unable to create account with these details', {
          code: 'REGISTRATION_FAILED',
        }),
      );
      return;
    }

    const passwordHash = await hashPassword(password);

    // Requires a Role row named 'BUYER' to already exist (seed data) —
    // `connect` looks up an existing row, it does not create one.
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        roles: {
          create: [{ role: { connect: { name: 'BUYER' } } }],
        },
      },
      include: { roles: { include: { role: true } } },
    });

    const roles = user.roles.map((userRole) => userRole.role.name);
    const token = signSessionToken({ sub: user.id, email: user.email, roles });
    setSessionCookie(res, token);

    res.status(201).json({
      status: 'ok',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(
  req: Request<unknown, unknown, LoginInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });

    // Identical message and status whether the email doesn't exist or
    // the password is wrong — distinguishing the two would tell an
    // attacker which emails have accounts on this platform.
    if (!user) {
      next(new HttpError(401, 'Invalid email or password', { code: 'INVALID_CREDENTIALS' }));
      return;
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      next(new HttpError(401, 'Invalid email or password', { code: 'INVALID_CREDENTIALS' }));
      return;
    }

    const roles = user.roles.map((userRole) => userRole.role.name);
    const token = signSessionToken({ sub: user.id, email: user.email, roles });
    setSessionCookie(res, token);

    res.status(200).json({
      status: 'ok',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
      },
    });
  } catch (err) {
    next(err);
  }
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME);
  res.status(200).json({ status: 'ok' });
}
