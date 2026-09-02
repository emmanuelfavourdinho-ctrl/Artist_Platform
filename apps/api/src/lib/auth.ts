import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

const BCRYPT_COST_FACTOR = 12;
const SESSION_TOKEN_TTL = '24h';

export interface AuthTokenPayload {
  sub: string; // User.id
  email: string;
  firstName: string;
  roles: string[]; // Role.name values, e.g. ['BUYER'] or ['BUYER', 'ADMIN']
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST_FACTOR);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signSessionToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: SESSION_TOKEN_TTL });
}

/**
 * Returns null for ANY verification failure — expired, malformed,
 * wrong signature, or a payload that's missing/mistyped fields. Callers
 * should treat null uniformly as "not authenticated," never inspect why.
 */
export function verifySessionToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded === 'string') return null;

    const { sub, email, firstName, roles } = decoded as Partial<AuthTokenPayload>;
    if (
      typeof sub !== 'string' ||
      typeof email !== 'string' ||
      typeof firstName !== 'string' ||
      !Array.isArray(roles)
    ) {
      return null;
    }
    return { sub, email, firstName, roles };
  } catch {
    return null;
  }
}
