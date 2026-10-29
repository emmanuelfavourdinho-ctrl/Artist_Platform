import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ currentUser: null as null | { getIdToken: ReturnType<typeof vi.fn> } }));
vi.mock('./firebaseClient', () => ({ firebaseAuth: auth }));

import { fetchStudioArtistProfile } from './studioApi';

const jsonResponse = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => {
  vi.resetAllMocks();
  auth.currentUser = { getIdToken: vi.fn().mockResolvedValue('fresh-token') };
  vi.stubGlobal('fetch', vi.fn());
});

describe('Studio API authentication', () => {
  it('sends the Firebase ID token as a Bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { data: { slug: 'studio' } }) as Response);
    await expect(fetchStudioArtistProfile()).resolves.toEqual({ slug: 'studio' });
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer fresh-token' });
    expect(auth.currentUser?.getIdToken).toHaveBeenCalledWith(false);
  });

  it('refreshes and retries once for an invalid session, but preserves permission errors', async () => {
    auth.currentUser!.getIdToken.mockResolvedValueOnce('stale-token').mockResolvedValueOnce('refreshed-token');
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(401, { code: 'SESSION_INVALID', message: 'Expired' }) as Response)
      .mockResolvedValueOnce(jsonResponse(200, { data: { slug: 'studio' } }) as Response);
    await expect(fetchStudioArtistProfile()).resolves.toEqual({ slug: 'studio' });
    expect(auth.currentUser?.getIdToken).toHaveBeenNthCalledWith(2, true);
    expect(fetch).toHaveBeenCalledTimes(2);

    vi.mocked(fetch).mockReset().mockResolvedValueOnce(jsonResponse(403, { code: 'FORBIDDEN', message: 'No permission' }) as Response);
    await expect(fetchStudioArtistProfile()).rejects.toThrow('No permission');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
