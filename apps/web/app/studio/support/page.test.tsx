import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const api = vi.hoisted(() => ({
  fetchStudioDisputes: vi.fn(),
  respondToStudioDispute: vi.fn(),
  fetchMyProfile: vi.fn(),
  submitContactMessage: vi.fn(),
}));

vi.mock('@/components/auth/ProtectedRoute', () => ({ ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/studio/StudioShell', () => ({ StudioShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/lib/studioApi', () => ({
  fetchStudioDisputes: api.fetchStudioDisputes,
  respondToStudioDispute: api.respondToStudioDispute,
}));
vi.mock('@/lib/userApi', () => ({ fetchMyProfile: api.fetchMyProfile }));
vi.mock('@/lib/contactApi', () => ({ submitContactMessage: api.submitContactMessage }));

import Page from './page';

const dispute = (overrides: Record<string, unknown> = {}) => ({
  id: 'dispute-1',
  status: 'OPEN',
  reason: 'DAMAGED',
  description: 'The frame arrived damaged.',
  evidenceReferences: ['buyer-proof'],
  artistResponse: null,
  artistEvidenceReferences: [],
  artistRespondedAt: null,
  resolutionNote: null,
  resolvedAt: null,
  createdAt: '2026-10-20T12:00:00Z',
  order: {
    id: 'order-1',
    orderNumber: 'ORD-1',
    status: 'SHIPPED',
    artistResponseDeadline: '2026-10-22T12:00:00Z',
    releaseStatus: 'BLOCKED',
    items: [{ id: 'item-1', title: 'Blue Study' }],
    deliveryEvents: [{ eventType: 'DELIVERY_DISPUTE_OPENED', occurredAt: '2026-10-20T12:00:00Z' }],
  },
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchStudioDisputes.mockResolvedValue([dispute()]);
  api.respondToStudioDispute.mockResolvedValue({ id: 'dispute-1', respondedAt: '2026-10-20T13:00:00Z', duplicate: false });
  api.fetchMyProfile.mockResolvedValue({ firstName: 'Ari', lastName: 'Artist', email: 'ari@example.test' });
  api.submitContactMessage.mockResolvedValue('contact-1');
});

describe('artist support and disputes', () => {
  it('shows dispute status, order timeline and records an artist response without claiming resolution', async () => {
    render(<Page />);
    expect(await screen.findByText(/Release status: BLOCKED/)).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Order timeline' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Your response to the review'), {
      target: { value: 'We packed the item with additional corner protection.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));
    await waitFor(() => expect(api.respondToStudioDispute).toHaveBeenCalledWith({
      disputeId: 'dispute-1',
      response: 'We packed the item with additional corner protection.',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent(/dispute remains open/i);
  });

  it('preserves a failed response and exposes an actionable API error', async () => {
    api.respondToStudioDispute.mockRejectedValueOnce(new Error('Response endpoint unavailable'));
    render(<Page />);
    const response = await screen.findByLabelText('Your response to the review');
    fireEvent.change(response, { target: { value: 'We can provide the original package photos.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Response endpoint unavailable');
    expect(response).toHaveValue('We can provide the original package photos.');
  });

  it('submits a support message through the existing contact workflow', async () => {
    render(<Page />);
    fireEvent.change(await screen.findByLabelText('Subject'), { target: { value: 'Question about my listing' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Please help me understand the listing review.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to support' }));
    await waitFor(() => expect(api.submitContactMessage).toHaveBeenCalledWith({
      name: 'Ari Artist',
      email: 'ari@example.test',
      subject: 'Question about my listing',
      message: 'Please help me understand the listing review.',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Your support message was recorded.');
  });
});
