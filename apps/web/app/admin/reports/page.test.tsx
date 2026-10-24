import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { adminRequest } = vi.hoisted(() => ({ adminRequest: vi.fn() }));
vi.mock('../../../lib/adminApi', () => ({
  adminRequest,
  AdminApiError: class AdminApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('../../../components/admin/AdminSessionContext', () => ({
  useAdminSession: () => ({ can: () => true }),
}));

import Page from './page';
import { AdminApiError } from '../../../lib/adminApi';

const report = {
  id: 'r1',
  targetType: 'ARTWORK' as const,
  reason: 'Impersonation',
  description: 'The listing copies another artist.',
  status: 'PENDING' as const,
  resolutionNote: null,
  createdAt: '2026-10-01T00:00:00Z',
  subject: {
    type: 'ARTWORK' as const,
    id: 'a1',
    title: 'Blue Study',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    artist: { displayName: 'Taylor', slug: 'taylor' },
  },
};
const pagination = { page: 1, pageSize: 20, total: 1, totalPages: 1 };

beforeEach(() => vi.resetAllMocks());

describe('admin reports page', () => {
  it('loads the open queue, shows subject details and the filtered total', async () => {
    adminRequest.mockResolvedValue({ data: [report], pagination });
    render(<Page />);
    expect(await screen.findByText('Blue Study')).toBeTruthy();
    expect(screen.getByText('The listing copies another artist.')).toBeTruthy();
    expect(screen.getByText('1 total')).toBeTruthy();
    expect(adminRequest).toHaveBeenCalledWith('GET', '/admin/reports', {
      query: { page: 1, pageSize: 20, status: 'OPEN' },
    });
  });

  it('requires a resolution note and refreshes after a successful decision', async () => {
    adminRequest
      .mockResolvedValueOnce({ data: [report], pagination })
      .mockResolvedValueOnce({ data: [], pagination: { ...pagination, total: 0, totalPages: 0 } })
      .mockResolvedValue({ data: [], pagination: { ...pagination, total: 0, totalPages: 0 } });
    render(<Page />);
    await screen.findByText('Blue Study');
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(
      await screen.findByText(
        'For a final decision, enter a resolution note of at least 10 characters.',
      ),
    ).toBeTruthy();
    expect(adminRequest).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText(/Resolution note/), {
      target: { value: 'Confirmed impersonation.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(adminRequest).toHaveBeenCalledTimes(3));
    expect(adminRequest).toHaveBeenNthCalledWith(2, 'PATCH', '/admin/reports/r1', {
      body: { status: 'RESOLVED', resolutionNote: 'Confirmed impersonation.' },
    });
    expect(await screen.findByText('No reports in this view')).toBeTruthy();
  });

  it('falls back to the previous valid page when moderation empties the last page', async () => {
    const first = {
      ...report,
      id: 'r-first',
      subject: { ...report.subject, title: 'First artwork' },
    };
    const last = { ...report, id: 'r-last', subject: { ...report.subject, title: 'Last artwork' } };
    adminRequest
      .mockResolvedValueOnce({
        data: [first],
        pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        data: [last],
        pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
      })
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({
        data: [],
        pagination: { page: 2, pageSize: 20, total: 20, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        data: [first],
        pagination: { page: 1, pageSize: 20, total: 20, totalPages: 1 },
      });
    render(<Page />);
    await screen.findByText('First artwork');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Last artwork');
    fireEvent.change(screen.getByLabelText(/Resolution note/), {
      target: { value: 'Confirmed the policy breach.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(await screen.findByText('First artwork')).toBeTruthy();
    expect(screen.queryByText('Last artwork')).toBeNull();
    await waitFor(() =>
      expect(adminRequest).toHaveBeenLastCalledWith('GET', '/admin/reports', {
        query: { page: 1, pageSize: 20, status: 'OPEN' },
      }),
    );
  });

  it('shows load failures and retries, and refreshes on stale conflicts', async () => {
    adminRequest
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce({ data: [report], pagination })
      .mockRejectedValueOnce(new AdminApiError(409, 'stale'))
      .mockResolvedValueOnce({ data: [], pagination: { ...pagination, total: 0, totalPages: 0 } });
    render(<Page />);
    expect(await screen.findByText('Network unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Blue Study');
    fireEvent.change(screen.getByLabelText(/Resolution note/), {
      target: { value: 'Reviewed evidence and confirmed.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(
      await screen.findByText(
        'This report changed while you were viewing it. The queue has been refreshed.',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(adminRequest).toHaveBeenCalledTimes(4));
  });
});
