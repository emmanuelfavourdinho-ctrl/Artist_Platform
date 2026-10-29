import { HttpError } from '../lib/httpError.js';

/*
  Explainer: the single definition of "may this artist sell?". Verification
  status is the authority, and it is separate from User.status (account
  standing). Unverified artists can still prepare their profile and draft
  artwork; what they cannot do is take part in selling — new checkouts
  against their artwork and new commission engagements. Existing accepted
  commitments are not affected by this check.
*/
export function isArtistVerified(artist: { verificationStatus: string }): boolean {
  return artist.verificationStatus === 'VERIFIED';
}

export function assertArtistVerified(
  artist: { verificationStatus: string },
  message = 'This artist is not yet verified',
): void {
  if (!isArtistVerified(artist)) {
    throw new HttpError(409, message, { code: 'ARTIST_NOT_VERIFIED' });
  }
}
