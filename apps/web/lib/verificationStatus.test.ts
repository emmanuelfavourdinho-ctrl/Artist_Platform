import { describe, expect, it } from 'vitest';
import { REQUEST_STATUS } from './verificationStatus';

describe('request status wording', () => {
  it('describes all four states, for staff and for the artist', () => {
    expect(REQUEST_STATUS.AWAITING_ARTIST_INPUT).toEqual({ staff: 'Awaiting artist input', artist: 'Waiting for your response', waitingOn: 'artist' });
    expect(REQUEST_STATUS.AWAITING_REVIEW.staff).toBe('Awaiting review');
    expect(REQUEST_STATUS.AWAITING_REVIEW.waitingOn).toBe('staff');
    expect(REQUEST_STATUS.COMPLETED.staff).toBe('Completed');
    expect(REQUEST_STATUS.CANCELLED.artist).toBe('Cancelled');
    expect(REQUEST_STATUS.COMPLETED.waitingOn).toBeNull();
    expect(REQUEST_STATUS.CANCELLED.waitingOn).toBeNull();
  });
});
