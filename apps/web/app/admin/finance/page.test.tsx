import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchAdminFinancialActivities, can } = vi.hoisted(() => ({
  fetchAdminFinancialActivities: vi.fn(),
  can: vi.fn(() => true),
}));

vi.mock('../../../components/admin/AdminSessionContext', () => ({
  useAdminSession: () => ({ can }),
}));
vi.mock('../../../lib/adminApi', () => ({ fetchAdminFinancialActivities }));

import Page from './page';

const activity = {
  id: 'activity-1',
  movementIdentifier: 'stripe:checkout-payment-confirmed:pi_123',
  movementType: 'CHECKOUT_PAYMENT_CONFIRMED',
  amountMinorUnits: '12500',
  amount: '125.00',
  currency: 'USD',
  provider: 'stripe',
  providerObjectReference: 'pi_123',
  occurredAt: '2026-10-10T12:00:00.000Z',
  recordedAt: '2026-10-10T12:01:00.000Z',
  sourceEventId: 'evt_123',
  checkoutSessionId: 'cs_123',
  order: { id: 'order-1', orderNumber: 'ART-1234' },
  payment: { id: 'payment-1', status: 'SUCCEEDED' },
};
const result = (data: unknown[]) => ({
  data,
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: data.length ? 1 : 0 },
});

beforeEach(() => {
  vi.resetAllMocks();
  can.mockReturnValue(true);
});

describe('Admin financial activity page', () => {
  it('shows recorded provider facts and distinguishes confirmation from settlement and payout', async () => {
    fetchAdminFinancialActivities.mockResolvedValue(result([activity]));
    render(<Page />);

    expect(await screen.findByText('USD 125.00')).toBeTruthy();
    expect(screen.getByText('pi_123')).toBeTruthy();
    expect(screen.getByText(/not provider settlement or artist payout/i)).toBeTruthy();
    expect(
      screen.getByText(/does not infer fees, refunds, disputes, settlements, or payouts/i),
    ).toBeTruthy();
    expect(fetchAdminFinancialActivities).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it('applies filters and renders empty state without adding cross-currency totals', async () => {
    fetchAdminFinancialActivities
      .mockResolvedValueOnce(result([activity]))
      .mockResolvedValueOnce(result([]));
    render(<Page />);
    await screen.findByText('USD 125.00');

    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'stripe' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'usd' } });
    fireEvent.change(screen.getByLabelText('Recorded from'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Movement, provider, order, or payment reference'), {
      target: { value: 'pi_123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(await screen.findByText('No financial activity found')).toBeTruthy();
    expect(fetchAdminFinancialActivities).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      provider: 'stripe',
      currency: 'USD',
      from: '2026-10-01T00:00:00.000Z',
      reference: 'pi_123',
    });
  });

  it('shows permission and request errors explicitly', async () => {
    can.mockReturnValue(false);
    const denied = render(<Page />);
    expect(screen.getByRole('alert').textContent).toContain('do not have permission');
    expect(fetchAdminFinancialActivities).not.toHaveBeenCalled();
    denied.unmount();

    can.mockReturnValue(true);
    fetchAdminFinancialActivities.mockRejectedValue(new Error('request failed'));
    render(<Page />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('request failed')).toBeTruthy();
  });
});
