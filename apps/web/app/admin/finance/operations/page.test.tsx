import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  api,
  can,
} = vi.hoisted(() => ({
  api: {
    fetchAdminRefunds: vi.fn(),
    fetchAdminPayouts: vi.fn(),
    fetchEligibleAdminPayouts: vi.fn(),
    createAdminRefund: vi.fn(),
    createAdminPayout: vi.fn(),
    decideAdminRefund: vi.fn(),
    decideAdminPayout: vi.fn(),
    retryAdminRefund: vi.fn(),
    retryAdminPayout: vi.fn(),
    submitAdminRefund: vi.fn(),
    submitAdminPayout: vi.fn(),
    reconcileAdminRefund: vi.fn(),
    reconcileAdminPayout: vi.fn(),
  },
  can: vi.fn((permission: string) => permission !== 'admin.no-access'),
}));

vi.mock('../../../../components/admin/AdminSessionContext', () => ({
  useAdminSession: () => ({ can }),
}));
vi.mock('../../../../lib/adminApi', () => api);

import Page from './page';

const page = (data: unknown[]) => ({
  data,
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: data.length ? 1 : 0 },
});

beforeEach(() => {
  vi.resetAllMocks();
  can.mockReturnValue(true);
  vi.stubGlobal('crypto', { randomUUID: () => 'refund-idempotency-key-0001' });
  api.fetchAdminRefunds.mockResolvedValue(page([{
    id: 'refund-1',
    paymentId: 'payment-1',
    amountMinorUnits: '12500',
    currency: 'USD',
    status: 'PENDING',
    providerReference: 'refund-ref-1',
    order: { id: 'order-1', orderNumber: 'ART-1001' },
  }]));
  api.fetchAdminPayouts.mockResolvedValue(page([{
    id: 'payout-1',
    fulfillmentId: 'fulfillment-1',
    amountMinorUnits: '9000',
    commissionMinorUnits: '1000',
    currency: 'USD',
    status: 'APPROVED',
    providerReference: null,
    order: { id: 'order-1', orderNumber: 'ART-1001' },
  }]));
  api.fetchEligibleAdminPayouts.mockResolvedValue(page([{
    fulfillmentId: 'eligible-1',
    artistId: 'artist-1',
    artistName: 'Artist One',
    orderId: 'order-2',
    orderNumber: 'ART-1002',
    amountMinorUnits: '4500',
    commissionMinorUnits: '500',
    currency: 'USD',
  }]));
});

afterEach(() => vi.unstubAllGlobals());

describe('Admin refund and payout operations page', () => {
  it('shows separate operation states and distinguishes payout eligibility from confirmed payment', async () => {
    render(<Page />);

    expect(await screen.findByText('USD 125.00')).toBeTruthy();
    expect(screen.getByText('USD 90.00')).toBeTruthy();
    expect(screen.getByText('USD 10.00')).toBeTruthy();
    expect(screen.getByText(/No live provider is configured/)).toBeTruthy();
    expect(screen.getByText(/only a provider-confirmed reconciliation/i)).toBeTruthy();
    expect(screen.getByText(/Release eligibility is not evidence of a payout/i)).toBeTruthy();
  });

  it('renders empty states and does not imply historical payouts', async () => {
    api.fetchAdminRefunds.mockResolvedValue(page([]));
    api.fetchAdminPayouts.mockResolvedValue(page([]));
    api.fetchEligibleAdminPayouts.mockResolvedValue(page([]));
    render(<Page />);

    expect(await screen.findByText('No refund operations')).toBeTruthy();
    expect(screen.getByText('No payout operations')).toBeTruthy();
    expect(screen.getByText('No eligible fulfillments')).toBeTruthy();
  });

  it('shows permission and load errors without requesting data for unauthorized viewers', async () => {
    can.mockReturnValue(false);
    const denied = render(<Page />);
    expect(screen.getByRole('alert').textContent).toContain('do not have permission');
    expect(api.fetchAdminRefunds).not.toHaveBeenCalled();
    denied.unmount();

    can.mockReturnValue(true);
    api.fetchAdminRefunds.mockRejectedValue(new Error('finance API unavailable'));
    render(<Page />);
    expect(await screen.findByText('finance API unavailable')).toBeTruthy();
  });

  it('keeps finance viewers read-only when they lack operation-specific permissions', async () => {
    can.mockImplementation((permission: string) => permission === 'finance.view');
    render(<Page />);

    await waitFor(() => expect(screen.getAllByText('Read-only').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create payout operation' })).toBeNull();
  });

  it('preserves refund request inputs when the API rejects the request', async () => {
    api.createAdminRefund.mockRejectedValue(new Error('refund API unavailable'));
    render(<Page />);

    await screen.findByText('USD 125.00');
    fireEvent.change(screen.getByLabelText('Payment ID'), { target: { value: 'payment-1' } });
    fireEvent.change(screen.getByLabelText('Amount in integer minor units'), { target: { value: '2500' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Approved after review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record refund request' }));

    expect(await screen.findByText('refund API unavailable')).toBeTruthy();
    expect(screen.getByLabelText('Payment ID')).toHaveProperty('value', 'payment-1');
    expect(screen.getByLabelText('Amount in integer minor units')).toHaveProperty('value', '2500');
    expect(screen.getByLabelText('Reason')).toHaveProperty('value', 'Approved after review');
  });
});
