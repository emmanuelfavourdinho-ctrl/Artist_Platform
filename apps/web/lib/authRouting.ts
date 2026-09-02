export interface AuthResponseUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
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
// Route names below are my best inference from your Next.js build
// output (/gallery, /studio, /admin exist; /dashboard does NOT — it was
// a dead route the old pages pushed to). I haven't seen /studio's or
// /gallery's actual content, so I can't confirm they handle every state
// this function implies (e.g. an incomplete artist profile). If /studio
// doesn't yet prompt incomplete profiles to finish onboarding, that's
// the next thing to build — this function just gets people to the
// right top-level area.
export function resolveAuthDestination(body: AuthSuccessBody): string {
  if (body.user.roles.includes('ADMIN')) return '/admin';
  if (body.user.roles.includes('ARTIST')) return '/studio';
  return '/gallery';
}
