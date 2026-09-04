import type { NextFunction, Request, Response } from 'express';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { slugify } from '../lib/slugify.js';
import { upgradeBuyerToArtist } from '../services/artistUpgrade.js';

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

/**
 * Synchronizes a Firebase Authenticated user into PostgreSQL.
 * Idempotent: safe to run multiple times without creating duplicate records.
 */
export async function syncUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpError(401, 'Missing or malformed Authorization header', {
        code: 'UNAUTHORIZED',
      });
    }

    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) {
      throw new HttpError(401, 'Missing or malformed Authorization header', {
        code: 'UNAUTHORIZED',
      });
    }
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const { uid: firebaseUid, email, name, email_verified: emailVerified } = decodedToken;

    if (!email) {
      throw new HttpError(400, 'Firebase user must have a valid email address', {
        code: 'INVALID_TOKEN',
      });
    }

    const { intent, firstName: bodyFirstName, lastName: bodyLastName } = req.body || {};

    let firstName = bodyFirstName;
    let lastName = bodyLastName;

    if (!firstName && name) {
      const parts = name.split(' ');
      firstName = parts[0];
      lastName = parts.slice(1).join(' ') || '';
    }

    firstName = firstName || 'User';
    lastName = lastName || '';

    // 1. Look up by firebaseUid or email
    let user = await prisma.user.findFirst({
      where: {
        OR: [{ firebaseUid }, { email }],
      },
      include: {
        roles: { include: { role: true } },
        artistProfile: { select: { displayName: true, biography: true, slug: true } },
      },
    });

    // 2. Bind firebaseUid if existing email account wasn't linked yet
    if (user && !user.firebaseUid) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firebaseUid,
          ...(emailVerified ? { emailVerifiedAt: user.emailVerifiedAt ?? new Date() } : {}),
          ...(emailVerified && user.status === 'PENDING_VERIFICATION' ? { status: 'ACTIVE' } : {}),
        },
        include: {
          roles: { include: { role: true } },
          artistProfile: { select: { displayName: true, biography: true, slug: true } },
        },
      });
    }

    if (
      user &&
      emailVerified &&
      (!user.emailVerifiedAt || user.status === 'PENDING_VERIFICATION')
    ) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          ...(user.status === 'PENDING_VERIFICATION' ? { status: 'ACTIVE' } : {}),
        },
        include: {
          roles: { include: { role: true } },
          artistProfile: { select: { displayName: true, biography: true, slug: true } },
        },
      });
    }

    // 3. If new user, create PostgreSQL account with selected intent role
    if (!user) {
      if (intent !== 'ARTIST' && intent !== 'BUYER') {
        throw new HttpError(400, 'Choose a platform intention before creating an account', {
          code: 'INTENT_REQUIRED',
        });
      }
      const requestedRole = intent;

      user = await prisma.user.create({
        data: {
          firebaseUid,
          email,
          firstName,
          lastName,
          status: emailVerified ? 'ACTIVE' : 'PENDING_VERIFICATION',
          roles: { create: [{ role: { connect: { name: 'BUYER' } } }] },
        },
        include: {
          roles: { include: { role: true } },
          artistProfile: { select: { displayName: true, biography: true, slug: true } },
        },
      });

      if (requestedRole === 'ARTIST') {
        const baseSlug = slugify(`${firstName} ${lastName}`) || `artist-${user.id.slice(0, 8)}`;

        await upgradeBuyerToArtist(user.id, {
          displayName: `${firstName} ${lastName}`.trim() || 'New Artist',
          slug: baseSlug,
        });

        user =
          (await prisma.user.findUnique({
            where: { id: user.id },
            include: {
              roles: { include: { role: true } },
              artistProfile: { select: { displayName: true, biography: true, slug: true } },
            },
          })) || user;
      }
    }

    const roles = user.roles.map((ur) => ur.role.name);

    res.status(200).json({
      status: 'ok',
      user: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        roles,
      },
      artistProfile: summarizeArtistProfile(user.artistProfile),
    });
  } catch (err) {
    next(err);
  }
}
