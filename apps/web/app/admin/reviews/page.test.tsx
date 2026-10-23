import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getIdToken, firebaseUser } = vi.hoisted(() => {
  const getIdToken = vi.fn();
  return { getIdToken, firebaseUser: { getIdToken } };
});

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ firebaseUser }),
}));
vi.mock('../../../components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../../lib/adminApi', () => ({ STAFF_ROLE_NAMES: ['ADMIN', 'MODERATOR'] }));

import Page from './page';

interface ReviewRow {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string };
  artwork: { id: string; title: string } | null;
}

const review = (id = 'review-1'): ReviewRow => ({
  id,
  rating: 5,
  title: 'Wonderful',
  comment: 'A thoughtful review of the artwork.',
  createdAt: '2026-10-01T00:00:00Z',
  user: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
  artwork: { id: 'art-1', title: 'Blue Study' },
});

function queueResponse(data: ReviewRow[], page = 1, total = data.length, totalPages = 1) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      status: 'success',
      data,
      pagination: { page, pageSize: 10, total, totalPages },
    }),
  };
}

function response(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  getIdToken.mockResolvedValue('firebase-token');
});

describe('admin review moderation queue', () => {
  it('shows the API total and requests the next page using the pagination contract', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(queueResponse([review()], 1, 21, 3))
      .mockResolvedValueOnce(queueResponse([review('review-11')], 2, 21, 3));
    vi.stubGlobal('fetch', fetchMock);

    render(<Page />);
    expect(await screen.findByText('21 pending reviews')).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toContain('?page=1&pageSize=10');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 2 of 3')).toBeTruthy();
    expect(fetchMock.mock.calls[1][0]).toContain('?page=2&pageSize=10');
    expect(await screen.findByText('Blue Study')).toBeTruthy();
  });

  it('refreshes the client-fetched queue after approval and shows the empty state', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(queueResponse([review()], 1, 1, 1))
      .mockResolvedValueOnce(response(200, { status: 'success', data: { status: 'APPROVED' } }))
      .mockResolvedValueOnce(queueResponse([], 1, 0, 0));
    vi.stubGlobal('fetch', fetchMock);

    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('The queue is empty - nothing waiting on moderation.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toContain('?page=1&pageSize=10');
  });

  it('moves back a page when moderation empties the current page', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(queueResponse(Array.from({ length: 10 }, (_, i) => review(`review-${i}`)), 1, 11, 2))
      .mockResolvedValueOnce(queueResponse([review('review-11')], 2, 11, 2))
      .mockResolvedValueOnce(response(200, { status: 'success', data: { status: 'REJECTED' } }))
      .mockResolvedValueOnce(queueResponse(Array.from({ length: 10 }, (_, i) => review(`review-${i}`)), 1, 10, 1));
    vi.stubGlobal('fetch', fetchMock);

    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await screen.findByText('Page 2 of 2');
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(await screen.findByText('10 pending reviews')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls[3][0]).toContain('?page=1&pageSize=10');
  });

  it('displays network and API errors and re-enables the action controls', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(queueResponse([review()]))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response(503, { message: 'Moderation service unavailable.' }));
    vi.stubGlobal('fetch', fetchMock);

    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Could not reach the server. Check your connection and try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Moderation service unavailable.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('disables both decisions while a request is in flight', async () => {
    let rejectRequest!: (error: Error) => void;
    const requestInFlight = new Promise<never>((_resolve, reject) => {
      rejectRequest = reject;
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(queueResponse([review()]))
      .mockReturnValueOnce(requestInFlight);
    vi.stubGlobal('fetch', fetchMock);

    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(screen.getByRole('button', { name: 'Approving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();

    rejectRequest(new Error('offline'));
    expect(await screen.findByText('Could not reach the server. Check your connection and try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('shows a useful fallback for a malformed HTTP error and refreshes on a stale 409', async () => {
    const malformed = { ok: false, status: 500, json: async () => { throw new Error('bad json'); } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(queueResponse([review()]))
      .mockResolvedValueOnce(malformed)
      .mockResolvedValueOnce(response(409, { code: 'REVIEW_ALREADY_MODERATED' }))
      .mockResolvedValueOnce(queueResponse([], 1, 0, 0));
    vi.stubGlobal('fetch', fetchMock);

    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Could not approve this review (request failed: 500).')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('This review has already been moderated. The queue has been refreshed.')).toBeTruthy();
    expect(await screen.findByText('The queue is empty - nothing waiting on moderation.')).toBeTruthy();
  });

  it('lets the admin retry a failed initial queue load', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(queueResponse([review()]));
    vi.stubGlobal('fetch', fetchMock);

    render(<Page />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Blue Study')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
