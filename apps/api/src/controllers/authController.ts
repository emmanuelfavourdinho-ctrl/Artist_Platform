import type { NextFunction, Request, Response } from 'express';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { slugify } from '../lib/slugify.js';
import { upgradeBuyerToArtist } from '../services/artistUpgrade.js';

// Types
export type SignupIntent = 'artist' | 'buyer';
export type BackendIntent = 'ARTIST' | 'BUYER';

interface SyncUserRequestBody {
  intent?: BackendIntent;
  firstName?: string;
  lastName?: string;
}

interface ArtistProfileSummary {
  exists: boolean;
  isComplete: boolean;
  slug: string | null;
}

// Helper Functions
export function parseSignupIntent(raw: string | null): SignupIntent | null {
  return raw === 'artist' || raw === 'buyer' ? raw : null;
}

export function toBackendIntent(intent: SignupIntent): BackendIntent {
  return intent === 'artist' ? 'ARTIST' : 'BUYER';
}

function summarizeArtistProfile(
  profile: { displayName: string; biography: string | null; slug: string } | null,
): ArtistProfileSummary {
  if (!profile) {
    return { exists: false, isComplete: false, slug: null };
  }
  return {
    exists: true,
    isComplete: Boolean(profile.biography && profile.biography.trim().length > 0),
    slug: profile.slug,
  };
}

/**
 * Synchronizes a Firebase Authenticated user into PostgreSQL.
 * Fully idempotent: Safe for both standard user login and initial user registration.
 */
export async function syncUser(
  req: Request<Record<string, never>, unknown, SyncUserRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> {
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

    // 1. Authenticate & Verify Token via Firebase Admin
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const { uid: firebaseUid, email: rawEmail, name, email_verified: emailVerified } = decodedToken;

    if (!rawEmail) {
      throw new HttpError(400, 'Firebase user must have a valid email address', {
        code: 'INVALID_TOKEN',
      });
    }

    // Normalize email casing to guarantee deterministic database queries
    const email = rawEmail.toLowerCase().trim();
    const { intent, firstName: bodyFirstName, lastName: bodyLastName } = req.body || {};

    let firstName = bodyFirstName?.trim();
    let lastName = bodyLastName?.trim();

    if (!firstName && name) {
      const parts = name.trim().split(' ');
      firstName = parts[0];
      lastName = parts.slice(1).join(' ') || '';
    }

    firstName = firstName || 'User';
    lastName = lastName || '';

    // 2. Database Synchronization Transaction
    const user = await prisma.$transaction(async (tx) => {
      // Step A: Search for existing account by firebaseUid OR normalized email
      let existingUser = await tx.user.findFirst({
        where: {
          OR: [{ firebaseUid }, { email }],
        },
        include: {
          roles: { include: { role: true } },
          artistProfile: { select: { displayName: true, biography: true, slug: true } },
        },
      });

      // Step B: Returning User Flow -> Update status/bindings and return early
      if (existingUser) {
        const needsUidBinding = !existingUser.firebaseUid;
        const needsVerificationUpdate =
          emailVerified &&
          (!existingUser.emailVerifiedAt || existingUser.status === 'PENDING_VERIFICATION');

        if (needsUidBinding || needsVerificationUpdate) {
          existingUser = await tx.user.update({
            where: { id: existingUser.id },
            data: {
              ...(needsUidBinding ? { firebaseUid } : {}),
              ...(emailVerified
                ? { emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date() }
                : {}),
              ...(emailVerified && existingUser.status === 'PENDING_VERIFICATION'
                ? { status: 'ACTIVE' }
                : {}),
            },
            include: {
              roles: { include: { role: true } },
              artistProfile: { select: { displayName: true, biography: true, slug: true } },
            },
          });
        }

        return existingUser;
      }

      // Step C: New User Signup Flow -> Validate Intent
      if (intent !== 'ARTIST' && intent !== 'BUYER') {
        throw new HttpError(
          400,
          'Choose whether you want to buy or sell artwork before creating an account',
          {
            code: 'INTENT_REQUIRED',
          },
        );
      }

      // Step D: Create User Record
      return await tx.user.create({
        data: {
          firebaseUid,
          email,
          firstName,
          lastName,
          status: emailVerified ? 'ACTIVE' : 'PENDING_VERIFICATION',
          emailVerifiedAt: emailVerified ? new Date() : null,
          roles: { create: [{ role: { connect: { name: 'BUYER' } } }] },
        },
        include: {
          roles: { include: { role: true } },
          artistProfile: { select: { displayName: true, biography: true, slug: true } },
        },
      });
    });

    // 3. Conditional Artist Role Upgrade (Signups specifying ARTIST intent)
    let finalUser = user;
    if (intent === 'ARTIST' && !finalUser.artistProfile) {
      const rawDisplayName = `${firstName} ${lastName}`.trim() || 'New Artist';
      const baseSlug = slugify(rawDisplayName) || `artist-${finalUser.id.slice(0, 8)}`;

      const slugExists = await prisma.artistProfile.findUnique({
        where: { slug: baseSlug },
        select: { id: true },
      });

      const finalSlug = slugExists
        ? `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`
        : baseSlug;

      await upgradeBuyerToArtist(finalUser.id, {
        displayName: rawDisplayName,
        slug: finalSlug,
      });

      const refreshedUser = await prisma.user.findUnique({
        where: { id: finalUser.id },
        include: {
          roles: { include: { role: true } },
          artistProfile: { select: { displayName: true, biography: true, slug: true } },
        },
      });

      if (refreshedUser) {
        finalUser = refreshedUser;
      }
    }

    const roles = finalUser.roles.map((ur) => ur.role.name);

    res.status(200).json({
      status: 'ok',
      user: {
        id: finalUser.id,
        firebaseUid: finalUser.firebaseUid,
        email: finalUser.email,
        firstName: finalUser.firstName,
        lastName: finalUser.lastName,
        status: finalUser.status,
        roles,
      },
      artistProfile: summarizeArtistProfile(finalUser.artistProfile),
    });
  } catch (err) {
    next(err);
  }
}
