import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const {
  confirmArtistOrderCompletion,
  correctShipmentTracking,
  fetchArtistOrderFulfillments,
  submitShipment,
} = vi.hoisted(() => ({
  confirmArtistOrderCompletion: vi.fn(),
  correctShipmentTracking: vi.fn(),
  fetchArtistOrderFulfillments: vi.fn(),
  submitShipment: vi.fn(),
}));

vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/studio/StudioShell', () => ({
  StudioShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/studioOrdersApi', () => ({
  confirmArtistOrderCompletion,
  correctShipmentTracking,
  fetchArtistOrderFulfillments,
  submitShipment,
}));

import Page from './page';

const fulfillment = (overrides: Record<string, unknown> = {}) => ({
  orderId: 'order-1',
  carrier: null,
  trackingReference: null,
  trackingUrl: null,
  evidenceReferences: [],
  shippedAt: null,
  artistCompletionConfirmedAt: null,
  order: {
    id: 'order-1',
    orderNumber: 'ART-1234',
    status: 'CONFIRMED',
    createdAt: '2026-10-10T12:00:00.000Z',
    buyerReceivedGoodAt: null,
    artistResponseDeadline: null,
    releaseStatus: 'NOT_ELIGIBLE',
    items: [{ id: 'item-1', title: 'Blue Study', quantity: 1, price: '100.00', currency: 'USD' }],
    deliveryDisputes: [],
  },
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  fetchArtistOrderFulfillments.mockResolvedValue([fulfillment()]);
  submitShipment.mockResolvedValue(undefined);
  correctShipmentTracking.mockResolvedValue(undefined);
  confirmArtistOrderCompletion.mockResolvedValue(undefined);
});

describe('artist order fulfillment page', () => {
  it('shows fulfillment status, validates required shipment fields, and submits shipment details', async () => {
    render(<Page />);
    expect(await screen.findByText('ART-1234')).toBeTruthy();
    expect(screen.getByText(/CONFIRMED/)).toBeTruthy();
    expect(screen.getByText(/Payment release eligibility:\s*NOT_ELIGIBLE/)).toBeTruthy();
    expect(screen.getByText(/does not authorize payment release or indicate that a payout was sent/i)).toBeTruthy();

    const submit = screen.getByRole('button', { name: 'Mark shipped' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Carrier'), { target: { value: 'Parcel Post' } });
    fireEvent.change(screen.getByLabelText('Tracking reference'), { target: { value: 'TRACK-789' } });
    expect(submit.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Tracking URL (HTTPS)'), {
      target: { value: 'https://carrier.example/track/TRACK-789' },
    });
    fireEvent.click(submit);

    await waitFor(() => expect(submitShipment).toHaveBeenCalledWith({
      orderId: 'order-1',
      carrier: 'Parcel Post',
      trackingReference: 'TRACK-789',
      trackingUrl: 'https://carrier.example/track/TRACK-789',
    }));
  });

  it('handles list loading and API errors explicitly', async () => {
    let resolveOrders!: (orders: ReturnType<typeof fulfillment>[]) => void;
    fetchArtistOrderFulfillments.mockReturnValueOnce(new Promise((resolve) => { resolveOrders = resolve; }));
    const { unmount } = render(<Page />);
    expect(screen.getByText(/loading orders/i)).toBeTruthy();
    resolveOrders([fulfillment({ shippedAt: '2026-10-20T12:00:00.000Z' })]);
    expect(await screen.findByText(/shipped/i)).toBeTruthy();
    unmount();

    fetchArtistOrderFulfillments.mockRejectedValueOnce(new Error('backend unavailable'));
    render(<Page />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/could not load your order fulfillments/i)).toBeTruthy();
  });

  it('shows shipment API errors and completion actions only after shipment', async () => {
    fetchArtistOrderFulfillments.mockResolvedValue([
      fulfillment({ shippedAt: '2026-10-20T12:00:00.000Z' }),
    ]);
    correctShipmentTracking.mockRejectedValueOnce(new Error('invalid tracking'));
    render(<Page />);
    expect(await screen.findByRole('button', { name: 'Confirm my completion' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Carrier'), { target: { value: 'Parcel Post' } });
    fireEvent.change(screen.getByLabelText('Tracking reference'), { target: { value: 'TRACK-789' } });
    fireEvent.change(screen.getByLabelText('Reason for tracking correction'), {
      target: { value: 'Correcting the carrier reference.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save audited tracking correction' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/shipment information could not be saved/i)).toBeTruthy();
    expect(correctShipmentTracking).toHaveBeenCalledWith({
      orderId: 'order-1',
      carrier: 'Parcel Post',
      trackingReference: 'TRACK-789',
      reason: 'Correcting the carrier reference.',
    });
  });
});
