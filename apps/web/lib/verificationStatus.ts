import type { RequestStatus } from './verificationTypes';

// One place for how each request state is described, so staff and artists
// are always told the same thing — and always in words, never colour alone.
export const REQUEST_STATUS: Record<
  RequestStatus,
  { staff: string; artist: string; waitingOn: 'artist' | 'staff' | null }
> = {
  AWAITING_ARTIST_INPUT: {
    staff: 'Awaiting artist input',
    artist: 'Waiting for your response',
    waitingOn: 'artist',
  },
  AWAITING_REVIEW: {
    staff: 'Awaiting review',
    artist: 'Submitted — awaiting review',
    waitingOn: 'staff',
  },
  COMPLETED: { staff: 'Completed', artist: 'Completed', waitingOn: null },
  CANCELLED: { staff: 'Cancelled', artist: 'Cancelled', waitingOn: null },
};
