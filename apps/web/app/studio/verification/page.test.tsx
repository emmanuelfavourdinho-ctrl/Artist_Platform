import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../../components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../../lib/verificationApi', () => ({ fetchOwnVerification: vi.fn() }));

import { fetchOwnVerification } from '../../../lib/verificationApi';
import type { OwnVerification } from '../../../lib/verificationTypes';
import Page from './page';

const own = (over: Partial<OwnVerification> = {}): OwnVerification => ({
  verificationStatus: 'PENDING', latestDecision: null, activeRequest: null, history: [], ...over,
});

beforeEach(() => vi.resetAllMocks());

describe('Studio verification status', () => {
  it('distinguishes a profile with no submitted verification request', async () => {
    vi.mocked(fetchOwnVerification).mockResolvedValue(own());
    render(<Page />);
    expect(await screen.findByText('Not submitted')).toBeTruthy();
    expect(screen.getByText(/review has not started/)).toBeTruthy();
  });

  it('shows a rejection outcome, its reason, and the supported next step', async () => {
    vi.mocked(fetchOwnVerification).mockResolvedValue(own({
      verificationStatus: 'REJECTED',
      latestDecision: {
        decision: 'REJECTED', reason: 'Please provide proof of authorship.', createdAt: '2026-10-20T12:00:00Z',
      },
    }));
    render(<Page />);
    expect(await screen.findByText('Rejected · not approved')).toBeTruthy();
    expect(screen.getByText('Please provide proof of authorship.')).toBeTruthy();
    expect(screen.getByText(/Resubmission is not currently available/)).toBeTruthy();
  });

  it('shows the approved state after the artist refreshes', async () => {
    vi.mocked(fetchOwnVerification).mockResolvedValue(own({ verificationStatus: 'VERIFIED' }));
    render(<Page />);
    expect(await screen.findByText('Approved · verified')).toBeTruthy();
  });
});
