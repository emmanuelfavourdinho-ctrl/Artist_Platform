import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchAdminOrders,
  fetchAdminOrder,
  fetchAdminPayments,
  fetchAdminPayment,
  can,
} = vi.hoisted(() => ({
  fetchAdminOrders: vi.fn(),
  fetchAdminOrder: vi.fn(),
  fetchAdminPayments: vi.fn(),
  fetchAdminPayment: vi.fn(),
  can: vi.fn(() => true),
}));

vi.mock('../../../components/admin/AdminSessionContext', () => ({
  useAdminSession: () => ({ can }),
}));
vi.mock('../../../lib/adminApi', () => ({
  fetchAdminOrders,
  fetchAdminOrder,
  fetchAdminPayments,
  fetchAdminPayment,
}));
vi.mock('../../../components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import Page from './page';

const orderRow = {
  id: 'order-1',
  orderNumber: 'ART-1234',
  status: 'CONFIRMED',
  subtotal: '100.00',
  shippingAmount: '0.00',
  taxAmount: '0.00',
  discountAmount: '0.00',
  totalAmount: '100.00',
  currency: 'USD',
  createdAt: '2026-10-10T12:00:00.000Z',
  updatedAt: '2026-10-10T12:00:00.000Z',
  _count: { items: 1, payments: 1 },
};
const paymentRow = {
  id: 'payment-1',
  provider: 'stripe',
  providerPaymentId: 'pi_123',
  amount: '100.00',
  currency: 'USD',
  status: 'SUCCEEDED',
  paidAt: '2026-10-10T12:01:00.000Z',
  createdAt: '2026-10-10T12:01:00.000Z',
  updatedAt: '2026-10-10T12:01:00.000Z',
};
const orderDetail = {
  ...orderRow,
  items: [{
    id: 'item-1',
    titleSnapshot: 'Blue study',
    artistNameSnapshot: 'Artist One',
    unitPrice: '100.00',
    quantity: 1,
    currency: 'USD',
    subtotal: '100.00',
    commissionRate: '0.1000',
    commissionAmount: '10.00',
  }],
  payments: [paymentRow],
};
const paymentDetail = {
  ...paymentRow,
  order: {
    id: 'order-1',
    orderNumber: 'ART-1234',
    status: 'CONFIRMED',
    subtotal: '100.00',
    shippingAmount: '0.00',
    taxAmount: '0.00',
    discountAmount: '0.00',
    totalAmount: '100.00',
    currency: 'USD',
    createdAt: '2026-10-10T12:00:00.000Z',
    items: orderDetail.items,
  },
};
const pageOf = (data: unknown[], total = data.length) => ({
  data,
  pagination: { page: 1, pageSize: 20, total, totalPages: total ? 1 : 0 },
});

beforeEach(() => {
  vi.resetAllMocks();
  can.mockReturnValue(true);
});

describe('admin orders and payments page', () => {
  it('loads order records and displays associated payment facts without implying settlement or payout', async () => {
    fetchAdminOrders.mockResolvedValue(pageOf([orderRow]));
    fetchAdminOrder.mockResolvedValue(orderDetail);
    render(<Page />);

    expect(await screen.findByText('ART-1234')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ART-1234' }));

    expect(await screen.findByText(/Blue study/)).toBeTruthy();
    expect(screen.getByText(/Commission snapshot/)).toBeTruthy();
    expect(screen.getByText(/not evidence of a transfer or artist payout/)).toBeTruthy();
    expect(screen.getByText('payment-1')).toBeTruthy();
    expect(fetchAdminOrder).toHaveBeenCalledWith('order-1');
  });

  it('switches to payments, opens a payment and links it to its order', async () => {
    fetchAdminOrders.mockResolvedValue(pageOf([orderRow]));
    fetchAdminPayments.mockResolvedValue(pageOf([{ ...paymentRow, order: { ...paymentDetail.order } }]));
    fetchAdminPayment.mockResolvedValue(paymentDetail);
    fetchAdminOrder.mockResolvedValue(orderDetail);
    render(<Page />);

    fireEvent.click(await screen.findByRole('tab', { name: 'payments' }));
    expect(await screen.findByText('payment-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'payment-1' }));

    expect(await screen.findByText('Provider payment reference: pi_123')).toBeTruthy();
    expect(screen.getByText(/does not establish provider settlement or artist payout/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /ART-1234 · CONFIRMED/ }));
    expect(await screen.findByText(/Blue study/)).toBeTruthy();
    expect(fetchAdminPayment).toHaveBeenCalledWith('payment-1');
    expect(fetchAdminOrder).toHaveBeenCalledWith('order-1');
  });

  it('ignores an older orders response that resolves after switching to payments', async () => {
    let resolveOldOrders!: (result: ReturnType<typeof pageOf>) => void;
    fetchAdminOrders.mockReturnValueOnce(new Promise((resolve) => { resolveOldOrders = resolve; }));
    fetchAdminPayments.mockResolvedValue(pageOf([{
      ...paymentRow,
      order: {
        id: 'order-1',
        orderNumber: 'ART-1234',
        status: 'CONFIRMED',
        totalAmount: '100.00',
        currency: 'USD',
        createdAt: '2026-10-10T12:00:00.000Z',
      },
    }]));
    render(<Page />);
    fireEvent.click(screen.getByRole('tab', { name: 'payments' }));
    expect(await screen.findByText('payment-1')).toBeTruthy();

    await act(async () => resolveOldOrders(pageOf([orderRow])));
    expect(screen.getByText('payment-1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ART-1234' })).toBeNull();
  });

  it('applies validated filters and shows an empty result', async () => {
    fetchAdminOrders.mockResolvedValueOnce(pageOf([orderRow])).mockResolvedValueOnce(pageOf([], 0));
    render(<Page />);
    await screen.findByText('ART-1234');

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'CONFIRMED' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'usd' } });
    fireEvent.change(screen.getByLabelText('Created from'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Created through'), { target: { value: '2026-10-31' } });
    fireEvent.change(screen.getByLabelText('Order, checkout, or payment reference'), { target: { value: 'ART-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(await screen.findByText('No orders found')).toBeTruthy();
    await waitFor(() => expect(fetchAdminOrders).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      status: 'CONFIRMED',
      currency: 'USD',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.999Z',
      reference: 'ART-1234',
    }));
  });

  it('requests the next page using the shared admin pagination control', async () => {
    fetchAdminOrders.mockResolvedValueOnce({
      data: [orderRow],
      pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 },
    }).mockResolvedValueOnce({
      data: [],
      pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
    });
    render(<Page />);
    await screen.findByText('ART-1234');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(fetchAdminOrders).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 }));
    expect(await screen.findByText('No orders found')).toBeTruthy();
  });

  it('shows a failed detail lookup without losing the order list', async () => {
    fetchAdminOrders.mockResolvedValue(pageOf([orderRow]));
    fetchAdminOrder.mockRejectedValue(new Error('Order details unavailable'));
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'ART-1234' }));
    expect(await screen.findByText('Order details unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ART-1234' })).toBeTruthy();
  });

  it('shows list and detail errors with retry, and denies the page without finance.view', async () => {
    fetchAdminOrders.mockRejectedValueOnce(new Error('Finance records unavailable')).mockResolvedValueOnce(pageOf([]));
    render(<Page />);
    expect(await screen.findByText('Finance records unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No orders found')).toBeTruthy();

    can.mockReturnValue(false);
    const { unmount } = render(<Page />);
    expect(screen.getByText('You do not have permission to view financial records.')).toBeTruthy();
    unmount();
  });
});
