import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

const BCRYPT_COST_FACTOR = 12;
const SESSION_TOKEN_TTL = '24h';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  roles: string[];
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

export function verifySessionToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded === 'string') return null;

    const { sub, email, roles } = decoded as Partial<AuthTokenPayload>;
    if (typeof sub !== 'string' || typeof email !== 'string' || !Array.isArray(roles)) {
      return null;
    }
    return { sub, email, roles };
  } catch {
    return null;
  }
}
