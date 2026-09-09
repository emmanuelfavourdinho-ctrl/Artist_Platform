import type { Route } from 'next';

export interface AuthResponseUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' | 'PENDING_VERIFICATION';
  roles: string[];
}

export interface AuthResponseArtistProfile {
  exists: boolean;
  isComplete: boolean;
  slug: string | null;
}

export interface AuthSuccessBody {
  status: 'ok';
  user: AuthResponseUser;
  artistProfile: AuthResponseArtistProfile;
}

// Centralizes "where does this person land," so registration and login
// can never silently drift into two different redirect rules.
//
// Return type is `Route` (Next.js's typed-routes type) rather than
// plain `string` — the three literal paths below are real pages, but
// TypeScript can't infer that through the if/else on its own, so each
// return is explicitly asserted `as Route`. This satisfies Next's
// typed `router.push()`/`<Link href>` checking without callers needing
// to cast anything themselves.
// `redirectTo` is the page the person was trying to reach before we sent
// them to /login (e.g. a commission request with `?artistId=...` already
// filled in — see ProtectedRoute). Suspended/deactivated accounts always
// go to /account/status regardless of redirectTo: that business rule must
// not be bypassable just by attaching a redirect param.
export function resolveAuthDestination(body: AuthSuccessBody, redirectTo?: string | null): Route {
  if (body.user.status === 'SUSPENDED' || body.user.status === 'DEACTIVATED') {
    return '/account/status' as Route;
  }
  const safeRedirect = getSafeRedirect(redirectTo);
  if (safeRedirect) return safeRedirect as Route;
  if (body.user.roles.includes('ADMIN')) return '/admin' as Route;
  if (body.user.roles.includes('ARTIST')) {
    return body.artistProfile.isComplete ? ('/studio' as Route) : ('/studio/onboarding' as Route);
  }
  return '/account' as Route;
}

// Validates a `?redirect=` value before ever handing it to router.push().
// Only same-origin, path-relative destinations are allowed — this blocks
// the classic open-redirect attack (`?redirect=https://evil.example` or
// `?redirect=//evil.example`), which is trivial to attempt against any
// login flow that blindly forwards a query param.
export function getSafeRedirect(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  if (raw.includes('://')) return null;
  return raw;
}
