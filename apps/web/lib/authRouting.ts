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
export function resolveAuthDestination(body: AuthSuccessBody): Route {
  if (body.user.status === 'SUSPENDED' || body.user.status === 'DEACTIVATED') {
    return '/account/status' as Route;
  }
  if (body.user.roles.includes('ADMIN')) return '/admin' as Route;
  if (body.user.roles.includes('ARTIST')) {
    return body.artistProfile.isComplete ? ('/studio' as Route) : ('/studio/onboarding' as Route);
  }
  return '/account' as Route;
}
