import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const api = vi.hoisted(() => ({ fetchStudioEarnings: vi.fn() }));

vi.mock('@/components/auth/ProtectedRoute', () => ({ ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/studio/StudioShell', () => ({ StudioShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/lib/studioApi', () => ({ fetchStudioEarnings: api.fetchStudioEarnings }));

import Page from './page';

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchStudioEarnings.mockResolvedValue({
    payouts: [],
    confirmedActivities: [],
    providerConfigured: false,
  });
});

describe('artist earnings page', () => {
  it('distinguishes release eligibility, operation status, and provider-confirmed payout movement', async () => {
    api.fetchStudioEarnings.mockResolvedValue({
      providerConfigured: false,
      payouts: [{
        id: 'payout-1',
        orderId: 'order-1',
        fulfillmentId: 'fulfillment-1',
        amountMinorUnits: '9000',
        commissionMinorUnits: '1000',
        currency: 'USD',
        status: 'PENDING',
        provider: 'test-only',
        providerReference: 'provider-ref-1',
        submittedAt: '2026-10-20T12:00:00Z',
        completedAt: null,
        createdAt: '2026-10-20T12:00:00Z',
        order: { orderNumber: 'ORD-1', releaseStatus: 'ELIGIBLE', releaseEligibleAt: '2026-10-19T12:00:00Z' },
        events: [{ eventType: 'SUBMITTED', fromStatus: 'APPROVED', toStatus: 'SUBMITTED', occurredAt: '2026-10-20T12:00:00Z' }],
      }],
      confirmedActivities: [],
    });
    render(<Page />);
    expect(await screen.findByText(/No live payout can be submitted/)).toBeTruthy();
    expect(screen.getByText(/Release eligibility: ELIGIBLE/)).toBeTruthy();
    expect(screen.getByText(/Payout status: PENDING/)).toBeTruthy();
    expect(screen.getByText(/No provider-confirmed payout movements/)).toBeTruthy();
    expect(screen.queryByText(/total earnings/i)).toBeNull();
  });

  it('shows an explicit empty state and retries a failed read', async () => {
    api.fetchStudioEarnings.mockRejectedValueOnce(new Error('Finance service unavailable'));
    render(<Page />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Finance service unavailable');
  });
});
