import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/verificationApi', () => ({ fetchVerificationQueue: vi.fn() }));

import { fetchVerificationQueue } from '../../../lib/verificationApi';
import type { QueueRow } from '../../../lib/verificationTypes';
import Page from './page';

const row = (over: Partial<QueueRow> = {}): QueueRow => ({
  id: 'a1',
  displayName: 'Ada Lovelace',
  location: null,
  createdAt: '2026-09-01T00:00:00Z',
  user: { firstName: 'Ada', lastName: 'L' },
  _count: { artworks: 3, verificationRequests: 0 },
  openRequest: null,
  ...over,
});
const result = (data: QueueRow[]) => ({
  data,
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
});

beforeEach(() => vi.resetAllMocks());

describe('artist verification queue', () => {
  it('shows a loading state, then the applications with a clear next step', async () => {
    vi.mocked(fetchVerificationQueue).mockResolvedValue(
      result([
        row(),
        row({
          id: 'a2',
          displayName: 'Ben',
          openRequest: {
            id: 'r',
            round: 2,
            status: 'AWAITING_ARTIST_INPUT',
            createdAt: '2026-10-01T00:00:00Z',
            submission: null,
          },
        }),
        row({
          id: 'a3',
          displayName: 'Cleo',
          openRequest: {
            id: 'r3',
            round: 1,
            status: 'AWAITING_REVIEW',
            createdAt: '2026-10-01T00:00:00Z',
            submission: { submittedAt: '2026-10-02T00:00:00Z' },
          },
        }),
      ]),
    );
    render(<Page />);
    expect(screen.getByRole('status', { name: 'Loading applications' })).toBeTruthy();

    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('No Active Request')).toBeTruthy();
    expect(screen.getByText('Waiting on the artist')).toBeTruthy();
    expect(screen.getByText('Needs your review')).toBeTruthy();
    expect(screen.getByText('Round 2: Awaiting artist input')).toBeTruthy();
    expect(screen.getByText('Round 1: Awaiting review')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ada Lovelace' }).getAttribute('href')).toBe(
      '/admin/artist-verification/a1',
    );
  });

  it('has an honest empty state', async () => {
    vi.mocked(fetchVerificationQueue).mockResolvedValue(result([]));
    render(<Page />);
    expect(await screen.findByText('No applications to review')).toBeTruthy();
  });

  it('shows an error with a working retry', async () => {
    vi.mocked(fetchVerificationQueue).mockRejectedValueOnce(
      new Error('You do not have permission to do this.'),
    );
    vi.mocked(fetchVerificationQueue).mockResolvedValueOnce(result([row()]));
    render(<Page />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/permission/);
    fireEvent.click(screen.getByText('Try again'));
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
  });

  it('passes the status filter to the server', async () => {
    vi.mocked(fetchVerificationQueue).mockResolvedValue(result([]));
    render(<Page />);
    await screen.findByText('No applications to review');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'AWAITING_REVIEW' } });
    await waitFor(() =>
      expect(vi.mocked(fetchVerificationQueue)).toHaveBeenLastCalledWith({
        page: 1,
        state: 'AWAITING_REVIEW',
      }),
    );
  });
});
