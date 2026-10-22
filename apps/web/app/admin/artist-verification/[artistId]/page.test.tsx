import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const can = vi.fn<(p: string) => boolean>();
vi.mock('next/navigation', () => ({ useParams: () => ({ artistId: 'artist-1' }) }));
vi.mock('../../../../components/admin/AdminSessionContext', () => ({
  useAdminSession: () => ({ session: { id: 'me', roles: ['MODERATOR'], permissions: [] }, can: (p: string) => can(p) }),
}));
vi.mock('../../../../lib/adminApi', () => ({
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, message: string, public code?: string, public issues: unknown[] = []) {
      super(message);
    }
  },
}));
vi.mock('../../../../lib/verificationApi', () => ({
  fetchReviewDetail: vi.fn(),
  createInfoRequest: vi.fn(),
  cancelInfoRequest: vi.fn(),
  decideVerification: vi.fn(),
}));

import { AdminApiError } from '../../../../lib/adminApi';
import {
  cancelInfoRequest,
  createInfoRequest,
  decideVerification,
  fetchReviewDetail,
} from '../../../../lib/verificationApi';
import type { ReviewDetail, ReviewRound } from '../../../../lib/verificationTypes';
import Page from './page';

const fields = [
  { id: 'PORTFOLIO_URL', type: 'PORTFOLIO_URL', label: 'Portfolio link', instructions: 'Link to your portfolio', required: true },
] as ReviewRound['fields'];

const round = (over: Partial<ReviewRound> = {}): ReviewRound => ({
  id: 'req-1', round: 1, status: 'AWAITING_REVIEW', message: null, fields,
  createdAt: '2026-10-01T10:00:00Z', completedAt: null, cancelledAt: null, cancellationReason: null,
  requestedBy: { id: 's', firstName: 'Sam', lastName: 'Staff' }, cancelledBy: null,
  submission: { responses: [{ fieldId: 'PORTFOLIO_URL', value: 'https://ada.example/work' }], submittedAt: '2026-10-02T10:00:00Z', submittedBy: null },
  ...over,
});

const detail = (over: Partial<ReviewDetail> = {}, artist: Partial<ReviewDetail['artist']> = {}): ReviewDetail => ({
  artist: {
    id: 'artist-1', displayName: 'Ada Lovelace', slug: 'ada', biography: 'Oil painter', artisticStatement: null,
    website: null, location: 'Lagos', verificationStatus: 'PENDING', verifiedAt: null, createdAt: '2026-09-01T00:00:00Z',
    user: { id: 'u', firstName: 'Ada', lastName: 'L', email: 'ada@example.com', status: 'ACTIVE', createdAt: '2026-09-01T00:00:00Z' },
    socialLinks: [], achievements: [], _count: { artworks: 3 }, ...artist,
  },
  requests: [round()], decisions: [], ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  can.mockReturnValue(true);
});

async function open(d: ReviewDetail) {
  vi.mocked(fetchReviewDetail).mockResolvedValue(d);
  render(<Page />);
  await screen.findByRole('heading', { name: 'Ada Lovelace' });
}

describe('review screen: what is shown', () => {
  it('shows what was requested, what the artist answered, and who/when', async () => {
    await open(detail());
    expect(screen.getByText(/Round 1 · Awaiting review/)).toBeTruthy();
    expect(screen.getByText(/by Sam Staff/)).toBeTruthy();
    expect(screen.getByText('Link to your portfolio')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Open external link: https://ada.example/work' });
    expect(link.getAttribute('href')).toBe('https://ada.example/work');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toContain('(external link)');
    expect(screen.getByText(/does not prove ownership/)).toBeTruthy();
    expect(screen.getByText(/The artist has responded/)).toBeTruthy();
  });

  it.each([
    'http://ada.example/work',
    'javascript:alert(1)',
    'https:///work',
    'https://user:pass@ada.example/work',
    'https://ada.example/\nwork',
  ])('never renders an invalid portfolio URL as a clickable link: %s', async (value) => {
    await open(
      detail({
        requests: [
          round({
            submission: {
              responses: [{ fieldId: 'PORTFOLIO_URL', value }],
              submittedAt: '2026-10-02T10:00:00Z',
              submittedBy: null,
            },
          }),
        ],
      }),
    );
    const responseText = screen.getAllByText((_content, element) => element?.textContent === value);
    expect(responseText.some((element) => element.tagName === 'SPAN' && element.closest('a') === null)).toBe(true);
  });

  it('keeps cancelled rounds and decisions in the history with their reasons', async () => {
    await open(
      detail({
        requests: [
          round({ id: 'r1', round: 1, status: 'CANCELLED', submission: null, cancelledAt: '2026-10-03T00:00:00Z', cancelledBy: { id: 's', firstName: 'Sam', lastName: 'Staff' }, cancellationReason: 'Artist emailed support instead' }),
          round({ id: 'r2', round: 2, status: 'COMPLETED' }),
        ],
        decisions: [{ id: 'd', decision: 'REJECTED', reason: 'Portfolio mismatch noted', requestId: 'r2', createdAt: '2026-10-05T00:00:00Z', decidedBy: { id: 's', firstName: 'Sam', lastName: 'Staff' } }],
      }, { verificationStatus: 'REJECTED' }),
    );
    expect(screen.getByText(/Round 1 · Cancelled/)).toBeTruthy();
    expect(screen.getByText(/Artist emailed support instead/)).toBeTruthy();
    expect(screen.getByText(/Round 2 · Completed/)).toBeTruthy();
    expect(screen.getByText('Portfolio mismatch noted')).toBeTruthy();
  });
});

describe('review screen: which actions each state offers', () => {
  it('while waiting on the artist: only cancel — no decision, no second request', async () => {
    await open(detail({ requests: [round({ status: 'AWAITING_ARTIST_INPUT', submission: null })] }));
    expect(screen.getByText('Cancel current request')).toBeTruthy();
    expect(screen.queryByText('Approve verification')).toBeNull();
    expect(screen.queryByText('Reject')).toBeNull();
    expect(screen.queryByText(/Request (more )?information/)).toBeNull();
    expect(screen.getByText(/Waiting for the artist to respond/)).toBeTruthy();
  });

  it('after a response: request more, cancel, approve and reject are all available', async () => {
    await open(detail());
    for (const label of ['Request more information', 'Cancel current request', 'Approve verification', 'Reject']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('offers no actions without artists.review, or once the application is decided', async () => {
    can.mockReturnValue(false);
    await open(detail());
    expect(screen.queryByText('Approve verification')).toBeNull();
    expect(screen.queryByText('Request more information')).toBeNull();
  });

  it('is read-only for an application that is already decided', async () => {
    await open(detail({ requests: [round({ status: 'COMPLETED' })] }, { verificationStatus: 'VERIFIED' }));
    expect(screen.queryByText('Approve verification')).toBeNull();
    expect(screen.getByText(/This application is verified/)).toBeTruthy();
  });
});

describe('review screen: consequential actions need confirmation', () => {
  it('approving asks first and only acts on confirm', async () => {
    vi.mocked(decideVerification).mockResolvedValue({ data: { verificationStatus: 'VERIFIED' } });
    await open(detail());
    fireEvent.click(screen.getByText('Approve verification'));

    const dialog = screen.getByRole('dialog', { name: /Approve Ada Lovelace/ });
    expect(within(dialog).getByText(/will be able to sell/)).toBeTruthy();
    expect(decideVerification).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByText('Confirm: approve'));
    await waitFor(() => expect(decideVerification).toHaveBeenCalledWith('artist-1', { decision: 'APPROVE', reason: undefined }));
    expect(await screen.findByRole('status')).toBeTruthy();
  });

  it('rejecting needs a real reason before it can be confirmed', async () => {
    vi.mocked(decideVerification).mockResolvedValue({ data: { verificationStatus: 'REJECTED' } });
    await open(detail());
    fireEvent.click(screen.getByText('Reject'));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByText('Confirm: reject') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'too short' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Portfolio does not match identity' } });
    expect(confirm.disabled).toBe(false);

    fireEvent.click(confirm);
    await waitFor(() =>
      expect(decideVerification).toHaveBeenCalledWith('artist-1', { decision: 'REJECT', reason: 'Portfolio does not match identity' }),
    );
  });

  it('cancelling a request needs a reason and targets that request', async () => {
    vi.mocked(cancelInfoRequest).mockResolvedValue({ data: { id: 'req-1' } });
    await open(detail());
    fireEvent.click(screen.getByText('Cancel current request'));
    const dialog = screen.getByRole('dialog', { name: /Cancel round 1/ });
    const confirm = within(dialog).getByText('Confirm: cancel request') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'No longer needed, resolved by email' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(cancelInfoRequest).toHaveBeenCalledWith('req-1', 'No longer needed, resolved by email'));
  });

  it('sends an information request only after the composer summary is confirmed', async () => {
    vi.mocked(createInfoRequest).mockResolvedValue({ data: { id: 'new', round: 2 } });
    await open(detail());
    fireEvent.click(screen.getByText('Request more information'));
    const dialog = screen.getByRole('dialog', { name: 'Request information' });
    fireEvent.click(within(dialog).getByLabelText(/Portfolio link/));
    fireEvent.change(within(dialog).getByLabelText('Instructions'), { target: { value: 'Send a current portfolio link' } });
    fireEvent.click(within(dialog).getByText('Review request'));
    expect(createInfoRequest).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByText('Send request'));
    await waitFor(() =>
      expect(createInfoRequest).toHaveBeenCalledWith('artist-1', {
        message: undefined,
        fields: [{ type: 'PORTFOLIO_URL', label: undefined, instructions: 'Send a current portfolio link', required: true }],
      }),
    );
  });

  it('shows a conflict from the server inside the dialog and keeps it open', async () => {
    vi.mocked(decideVerification).mockRejectedValue(new AdminApiError(409, 'This application was decided by someone else. Reload to see the outcome.', 'CONCURRENT_CHANGE'));
    await open(detail());
    fireEvent.click(screen.getByText('Approve verification'));
    fireEvent.click(screen.getByText('Confirm: approve'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/decided by someone else/);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('review screen: states', () => {
  it('shows a loading state then an error with retry', async () => {
    vi.mocked(fetchReviewDetail).mockRejectedValueOnce(new Error('Artist profile not found'));
    vi.mocked(fetchReviewDetail).mockResolvedValueOnce(detail());
    render(<Page />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/not found/);
    fireEvent.click(screen.getByText('Try again'));
    expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeTruthy();
  });
});
