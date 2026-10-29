import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const {
  confirmOrderReceipt,
  fetchMyOrders,
  fetchOrderDelivery,
  reportOrderDeliveryIssue,
} = vi.hoisted(() => ({
  confirmOrderReceipt: vi.fn(),
  fetchMyOrders: vi.fn(),
  fetchOrderDelivery: vi.fn(),
  reportOrderDeliveryIssue: vi.fn(),
}));

vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/ordersApi', () => ({
  confirmOrderReceipt,
  fetchMyOrders,
  fetchOrderDelivery,
  reportOrderDeliveryIssue,
}));

import Page from './page';

const order = {
  id: 'order-1',
  orderNumber: 'ART-1234',
  status: 'SHIPPED',
  subtotal: '125.00',
  totalAmount: '125.00',
  currency: 'USD',
  createdAt: '2026-10-10T12:00:00.000Z',
  items: [{
    id: 'item-1',
    titleSnapshot: 'Blue study',
    artistNameSnapshot: 'Artist One',
    unitPrice: '125.00',
    quantity: 1,
    currency: 'USD',
    subtotal: '125.00',
  }],
};

const delivery = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-1',
  orderNumber: 'ART-1234',
  status: 'SHIPPED',
  releaseStatus: 'NOT_ELIGIBLE',
  buyerReceivedGoodAt: null,
  artistResponseDeadline: null,
  releaseEligibleAt: null,
  releaseHoldAt: null,
  fulfillments: [{
    artistName: 'Artist One',
    carrier: 'Parcel Post',
    trackingReference: 'TRACK-789',
    trackingUrl: 'https://carrier.example/track/TRACK-789',
    shippedAt: '2026-10-20T12:00:00.000Z',
    artistCompletionConfirmedAt: null,
  }],
  disputes: [],
  events: [],
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  fetchMyOrders.mockResolvedValue([order]);
  fetchOrderDelivery.mockResolvedValue(delivery());
  confirmOrderReceipt.mockResolvedValue(undefined);
  reportOrderDeliveryIssue.mockResolvedValue(undefined);
});

describe('buyer order delivery workflow', () => {
  it('loads shipment and tracking details and requires explicit receipt confirmation', async () => {
    fetchOrderDelivery
      .mockResolvedValueOnce(delivery())
      .mockResolvedValueOnce(delivery({ buyerReceivedGoodAt: '2026-10-25T12:00:00.000Z' }));
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /view delivery/i }));

    expect(await screen.findByText(/TRACK-789/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open carrier tracking' }).getAttribute('href'))
      .toBe('https://carrier.example/track/TRACK-789');
    expect(screen.getByText(/not yet eligible for release/i)).toBeTruthy();
    expect(screen.getByText(/does not mean settlement or payout/i)).toBeTruthy();

    const confirm = screen.getByRole('button', { name: 'Confirm receipt' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(confirmOrderReceipt).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: /received this order in good condition/i }));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(confirmOrderReceipt).toHaveBeenCalledWith('order-1'));
    expect(await screen.findByText(/receipt confirmed/i)).toBeTruthy();
  });

  it('reports a delivery problem and displays the saved issue', async () => {
    fetchOrderDelivery
      .mockResolvedValueOnce(delivery())
      .mockResolvedValueOnce(delivery({
        disputes: [{
          id: 'dispute-1',
          status: 'OPEN',
          reason: 'DAMAGED',
          description: 'The frame arrived damaged.',
          evidenceReferences: [],
          resolutionNote: null,
          resolvedAt: null,
          createdAt: '2026-10-21T12:00:00.000Z',
        }],
      }));
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /view delivery/i }));
    await screen.findByText(/TRACK-789/);
    fireEvent.change(screen.getByLabelText('Issue type'), { target: { value: 'DAMAGED' } });
    fireEvent.change(screen.getByLabelText('Describe the delivery problem'), {
      target: { value: 'The frame arrived damaged.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit delivery issue' }));

    await waitFor(() => expect(reportOrderDeliveryIssue).toHaveBeenCalledWith({
      orderId: 'order-1',
      reason: 'DAMAGED',
      description: 'The frame arrived damaged.',
    }));
    expect(await screen.findByText('Delivery issue: OPEN · DAMAGED')).toBeTruthy();
  });

  it('shows list, delivery-detail loading, and error states', async () => {
    let resolveDetails!: (value: ReturnType<typeof delivery>) => void;
    fetchOrderDelivery.mockReturnValueOnce(new Promise((resolve) => { resolveDetails = resolve; }));
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /view delivery/i }));
    expect(screen.getByText(/loading delivery details/i)).toBeTruthy();
    resolveDetails(delivery());
    expect(await screen.findByText(/TRACK-789/)).toBeTruthy();
    expect(fetchOrderDelivery).toHaveBeenCalledWith('order-1');

    fetchMyOrders.mockRejectedValueOnce(new Error('orders unavailable'));
    const secondRender = render(<Page />);
    expect(await secondRender.findByText(/couldn.t load your orders/i)).toBeTruthy();
  });

  it('shows an actionable error when receipt confirmation fails', async () => {
    confirmOrderReceipt.mockRejectedValueOnce(new Error('request failed'));
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /view delivery/i }));
    await screen.findByText(/TRACK-789/);
    fireEvent.click(screen.getByRole('checkbox', { name: /received this order in good condition/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm receipt' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/receipt could not be confirmed/i)).toBeTruthy();
  });
});
