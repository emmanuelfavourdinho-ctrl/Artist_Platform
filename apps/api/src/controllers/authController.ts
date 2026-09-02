import type { NextFunction, Request, Response } from 'express';
import { hashPassword, verifyPassword, signSessionToken } from '../lib/auth.js';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { slugify } from '../lib/slugify.js';
import { SESSION_COOKIE_NAME } from '../middleware/requireAuth.js';
import { config } from '../config/index.js';
import { upgradeBuyerToArtist } from '../services/artistUpgrade.js';
import type { RegisterInput, LoginInput } from '../schemas/authSchemas.js';

const SESSION_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    signed: true,
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  });
}

// Shared shape for both register() and login() responses, so the
// frontend has one consistent thing to branch its redirect on either
// way it arrives at "authenticated."
//
// `isComplete` is a placeholder heuristic (has a bio) — not backed by a
// real onboardingCompletedAt column, because that field doesn't exist
// in schema.prisma yet. Flagging rather than quietly deciding this for
// you: if you want a real signal here, add that column to ArtistProfile
// and swap this heuristic out. Until then, treat isComplete as "good
// enough to route away from a blocking onboarding screen," not as a
// trustworthy completeness check.
function summarizeArtistProfile(
  profile: { displayName: string; biography: string | null; slug: string } | null,
): { exists: boolean; isComplete: boolean; slug: string | null } {
  if (!profile) return { exists: false, isComplete: false, slug: null };
  return {
    exists: true,
    isComplete: Boolean(profile.biography && profile.biography.trim().length > 0),
    slug: profile.slug,
  };
}

export async function register(
  req: Request<unknown, unknown, RegisterInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password, firstName, lastName, intent } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      next(
        new HttpError(409, 'Unable to create account with these details', {
          code: 'REGISTRATION_FAILED',
        }),
      );
      return;
    }

    const passwordHash = await hashPassword(password);

    // Every account gets BUYER regardless of intent — an artist can
    // still browse/favorite/purchase (spec section 14). ARTIST is
    // layered on top, never a replacement for it.
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        roles: { create: [{ role: { connect: { name: 'BUYER' } } }] },
      },
      include: { roles: { include: { role: true } } },
    });

    let roles = user.roles.map((userRole) => userRole.role.name);
    let artistProfile: { displayName: string; biography: string | null; slug: string } | null =
      null;

    if (intent === 'ARTIST') {
      // Reuses the existing, already-transactional upgrade service as-is
      // — no changes to it, just wiring it into registration.
      const baseSlug = slugify(`${firstName} ${lastName}`) || `artist-${user.id.slice(0, 8)}`;
      const profile = await upgradeBuyerToArtist(user.id, {
        displayName: `${firstName} ${lastName}`,
        slug: baseSlug,
      });
      artistProfile = {
        displayName: profile.displayName,
        biography: profile.biography,
        slug: profile.slug,
      };
      roles = [...roles, 'ARTIST'];
    }

    // Signed AFTER role assignment so the token's roles claim — which
    // requireAdmin and any future requireArtist middleware trust — is
    // correct from the very first request, not stale until next login.
    const token = signSessionToken({
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      roles,
    });
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
      artistProfile: summarizeArtistProfile(artistProfile),
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
      include: {
        roles: { include: { role: true } },
        artistProfile: { select: { displayName: true, biography: true, slug: true } },
      },
    });

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
    const token = signSessionToken({
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      roles,
    });
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
      artistProfile: summarizeArtistProfile(user.artistProfile),
    });
  } catch (err) {
    next(err);
  }
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.status(200).json({ status: 'ok' });
}
