import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/verificationApi', () => ({ fetchOwnVerification: vi.fn() }));

import { fetchOwnVerification } from '../../lib/verificationApi';
import type { ArtistRequest, OwnVerification } from '../../lib/verificationTypes';
import { VerificationTaskBanner } from './VerificationTaskBanner';

const req = (status: ArtistRequest['status']): ArtistRequest => ({
  id: 'req-9', round: 1, status, message: null, fields: [], createdAt: '2026-10-01T00:00:00Z',
  completedAt: null, cancelledAt: null, submission: null,
});
const own = (over: Partial<OwnVerification>): OwnVerification => ({
  verificationStatus: 'PENDING', activeRequest: null, history: [], ...over,
});

beforeEach(() => vi.resetAllMocks());

describe('VerificationTaskBanner (persistent dashboard task)', () => {
  it('asks for action and links to the artist-owned task when input is needed', async () => {
    vi.mocked(fetchOwnVerification).mockResolvedValue(own({ activeRequest: req('AWAITING_ARTIST_INPUT') }));
    render(<VerificationTaskBanner />);
    expect(await screen.findByText(/Action needed/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Respond now' }).getAttribute('href')).toBe('/studio/verification/req-9');
  });

  it('says the response is awaiting review once submitted', async () => {
    vi.mocked(fetchOwnVerification).mockResolvedValue(own({ activeRequest: req('AWAITING_REVIEW') }));
    render(<VerificationTaskBanner />);
    expect(await screen.findByText('Verification in review')).toBeTruthy();
    expect(screen.getByText(/awaiting review/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View your response' }).getAttribute('href')).toBe('/studio/verification/req-9');
  });

  it('shows a calm pending state with no task, and does not block draft work', async () => {
    vi.mocked(fetchOwnVerification).mockResolvedValue(own({}));
    render(<VerificationTaskBanner />);
    expect(await screen.findByText('Verification pending')).toBeTruthy();
    expect(screen.getByText(/keep preparing your profile and draft artwork/)).toBeTruthy();
  });

  it('reports a rejection without exposing any internal reason', async () => {
    vi.mocked(fetchOwnVerification).mockResolvedValue(own({ verificationStatus: 'REJECTED' }));
    render(<VerificationTaskBanner />);
    expect(await screen.findByText(/not approved/)).toBeTruthy();
    expect(screen.getByText(/Contact support/)).toBeTruthy();
  });

  it('renders nothing for a verified artist, and nothing if the call fails', async () => {
    vi.mocked(fetchOwnVerification).mockResolvedValue(own({ verificationStatus: 'VERIFIED' }));
    const { container, rerender } = render(<VerificationTaskBanner />);
    await waitFor(() => expect(fetchOwnVerification).toHaveBeenCalled());
    expect(container.textContent).toBe('');

    vi.mocked(fetchOwnVerification).mockRejectedValue(new Error('down'));
    rerender(<VerificationTaskBanner key="again" />);
    await waitFor(() => expect(fetchOwnVerification).toHaveBeenCalledTimes(2));
    expect(container.textContent).toBe('');
  });
});
