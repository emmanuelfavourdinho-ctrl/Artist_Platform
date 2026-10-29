import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const api = vi.hoisted(() => ({
  fetchStudioArtworks: vi.fn(),
  fetchStudioDisputes: vi.fn(),
  fetchArtistOrderFulfillments: vi.fn(),
}));

vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/studio/StudioShell', () => ({
  StudioShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/studio/VerificationTaskBanner', () => ({ VerificationTaskBanner: () => null }));
vi.mock('@/lib/studioApi', () => ({
  fetchStudioArtworks: api.fetchStudioArtworks,
  fetchStudioDisputes: api.fetchStudioDisputes,
}));
vi.mock('@/lib/studioOrdersApi', () => ({ fetchArtistOrderFulfillments: api.fetchArtistOrderFulfillments }));

import Page from './page';

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchArtistOrderFulfillments.mockResolvedValue([]);
  api.fetchStudioDisputes.mockResolvedValue([]);
  api.fetchStudioArtworks.mockResolvedValue({ artworks: [], artist: { slug: 'artist' } });
});

describe('artist studio overview', () => {
  it('prioritizes genuine shipment, dispute, and rejected-listing tasks', async () => {
    api.fetchArtistOrderFulfillments.mockResolvedValue([{
      orderId: 'order-1', shippedAt: null, order: {
        orderNumber: 'ORD-1', status: 'PROCESSING', items: [{ title: 'Blue Study' }],
      },
    }]);
    api.fetchStudioDisputes.mockResolvedValue([{
      id: 'dispute-1', status: 'OPEN', artistRespondedAt: null, reason: 'DAMAGED',
      description: 'The frame arrived damaged.', order: { orderNumber: 'ORD-2', items: [] },
    }]);
    api.fetchStudioArtworks.mockResolvedValue({ artworks: [{
      id: 'art-1', status: 'REJECTED', title: 'Still Morning',
      moderationHistory: [{ reason: 'Please add a clearer image.' }],
    }] });
    render(<Page />);

    expect(await screen.findByText(/Prepare and record shipment/)).toBeTruthy();
    expect(screen.getByText(/dispute response needed/i)).toBeTruthy();
    expect(screen.getByText(/Please add a clearer image/)).toBeTruthy();
    expect(screen.getAllByRole('link').some((link) => link.getAttribute('href') === '/studio/support')).toBe(true);
  });

  it('shows a useful all-clear state and allows retry after API failure', async () => {
    api.fetchArtistOrderFulfillments.mockRejectedValueOnce(new Error('offline'));
    render(<Page />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/You’re all caught up/)).toBeTruthy();
  });
});
