import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchArtworkQueue, fetchArtworkDetail, decideArtwork, allowed } = vi.hoisted(() => ({
  fetchArtworkQueue: vi.fn(),
  fetchArtworkDetail: vi.fn(),
  decideArtwork: vi.fn(),
  allowed: { current: true },
}));
vi.mock('../../../lib/artworkModerationApi', () => ({
  fetchArtworkQueue,
  fetchArtworkDetail,
  decideArtwork,
}));
vi.mock('../../../lib/adminApi', () => ({
  AdminApiError: class AdminApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('../../../components/admin/AdminSessionContext', () => ({
  useAdminSession: () => ({ can: () => allowed.current }),
}));

import Page from './page';
import { AdminApiError } from '../../../lib/adminApi';
import type { ArtworkModerationItem } from '../../../lib/artworkModerationApi';

const artwork = (id = 'art-1'): ArtworkModerationItem => ({
  id,
  title: 'Blue Study',
  slug: 'blue-study',
  description: 'A study in blue.',
  price: '120.00',
  currency: 'USD',
  yearCreated: 2024,
  width: 30,
  height: 40,
  depth: null,
  materials: 'Oil on canvas',
  status: 'PENDING_REVIEW',
  visibility: 'PRIVATE',
  createdAt: '2026-10-01T00:00:00Z',
  images: [{ id: 'image-1', url: '/blue.jpg', altText: 'Blue painting', isPrimary: true }],
  categories: [{ category: { id: 'cat-1', name: 'Painting' } }],
  styles: [],
  themes: [],
  mediums: [],
  artist: { id: 'artist-1', displayName: 'Ada Artist', slug: 'ada-artist', profileImageUrl: null },
});
const result = (
  items: ArtworkModerationItem[],
  page = 1,
  total = items.length,
  totalPages = total ? 1 : 0,
) => ({
  data: items,
  pagination: { page, pageSize: 20, total, totalPages },
});

beforeEach(() => {
  vi.resetAllMocks();
  allowed.current = true;
});

describe('admin artwork moderation page', () => {
  it('does not load the queue for a staff session without the moderation permission', () => {
    allowed.current = false;
    render(<Page />);
    expect(screen.getByRole('alert')).toHaveTextContent('do not have permission');
    expect(fetchArtworkQueue).not.toHaveBeenCalled();
  });

  it('shows loading, paginates with API totals, and loads details before offering decisions', async () => {
    fetchArtworkQueue
      .mockResolvedValueOnce(result([artwork()], 1, 21, 2))
      .mockResolvedValueOnce(result([artwork('art-21')], 2, 21, 2));
    fetchArtworkDetail.mockResolvedValue(artwork());
    render(<Page />);
    expect(screen.getByRole('status', { name: 'Loading artwork queue' })).toBeTruthy();
    expect(await screen.findByText('21 pending artworks')).toBeTruthy();
    expect(screen.getByText(/By Ada Artist/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(fetchArtworkQueue).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Review details' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(await screen.findByText('A study in blue.')).toBeTruthy();
    expect(fetchArtworkDetail).toHaveBeenCalledWith('art-21');
  });

  it('confirms approval and refreshes the pending queue', async () => {
    fetchArtworkQueue.mockResolvedValueOnce(result([artwork()])).mockResolvedValueOnce(result([]));
    fetchArtworkDetail.mockResolvedValue(artwork());
    decideArtwork.mockResolvedValue({ data: { id: 'art-1', status: 'APPROVED' } });
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(screen.getByRole('heading', { name: 'Confirm approval' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));
    await waitFor(() => expect(decideArtwork).toHaveBeenCalledWith('art-1', { action: 'approve' }));
    expect(await screen.findByText('No artwork waiting for review')).toBeTruthy();
    expect(fetchArtworkQueue).toHaveBeenCalledTimes(2);
  });

  it('requires a meaningful reason to confirm rejection and sends the trimmed reason', async () => {
    fetchArtworkQueue.mockResolvedValue(result([artwork()]));
    fetchArtworkDetail.mockResolvedValue(artwork());
    decideArtwork.mockResolvedValue({ data: { id: 'art-1', status: 'REJECTED' } });
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const confirm = screen.getByRole('button', { name: 'Confirm rejection' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Rejection reason'), {
      target: { value: '  Missing dimensions  ' },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(decideArtwork).toHaveBeenCalledWith('art-1', {
        action: 'reject',
        reason: 'Missing dimensions',
      }),
    );
  });

  it('shows load errors with retry, and refreshes after a stale conflict', async () => {
    fetchArtworkQueue
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(result([artwork()]))
      .mockResolvedValueOnce(result([]));
    fetchArtworkDetail.mockResolvedValue(artwork());
    decideArtwork.mockRejectedValue(
      new AdminApiError(409, 'Already decided', 'ARTWORK_ALREADY_MODERATED'),
    );
    render(<Page />);
    expect((await screen.findByRole('alert')).textContent).toContain('Network unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));
    expect(await screen.findByText(/already moderated/)).toBeTruthy();
    expect(await screen.findByText('No artwork waiting for review')).toBeTruthy();
  });

  it('shows an API decision error and restores the confirmation controls for retry', async () => {
    fetchArtworkQueue.mockResolvedValue(result([artwork()]));
    fetchArtworkDetail.mockResolvedValue(artwork());
    decideArtwork.mockRejectedValueOnce(new Error('The server could not complete this request.'));
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('server could not complete');
    expect(screen.getByRole('button', { name: 'Confirm approval' })).toBeEnabled();
  });

  it('disables confirmation while a decision request is in progress', async () => {
    let resolveDecision!: (value: unknown) => void;
    decideArtwork.mockReturnValue(
      new Promise((resolve) => {
        resolveDecision = resolve;
      }),
    );
    fetchArtworkQueue.mockResolvedValue(result([artwork()]));
    fetchArtworkDetail.mockResolvedValue(artwork());
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    resolveDecision({ data: { id: 'art-1', status: 'APPROVED' } });
    await waitFor(() => expect(fetchArtworkQueue).toHaveBeenCalledTimes(2));
  });

  it('moves back when moderation empties the current page', async () => {
    fetchArtworkQueue
      .mockResolvedValueOnce(
        result(
          Array.from({ length: 20 }, (_, index) => artwork(`art-${index}`)),
          1,
          21,
          2,
        ),
      )
      .mockResolvedValueOnce(result([artwork('art-21')], 2, 21, 2))
      .mockResolvedValueOnce(
        result(
          Array.from({ length: 20 }, (_, index) => artwork(`art-${index}`)),
          1,
          20,
          1,
        ),
      );
    fetchArtworkDetail.mockResolvedValue(artwork());
    decideArtwork.mockResolvedValue({ data: { id: 'art-1', status: 'APPROVED' } });
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(fetchArtworkQueue).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole('button', { name: 'Review details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));
    await waitFor(() =>
      expect(fetchArtworkQueue).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 }),
    );
  });
});
