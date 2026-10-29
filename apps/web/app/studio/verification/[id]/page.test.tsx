import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'req-9' }) }));
vi.mock('../../../../components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../../../lib/adminApi', () => ({
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, message: string, public code?: string, public issues: { path: string; message: string }[] = []) {
      super(message);
    }
  },
}));
vi.mock('../../../../lib/verificationApi', () => ({ fetchOwnRequest: vi.fn(), submitOwnResponse: vi.fn() }));

import { AdminApiError } from '../../../../lib/adminApi';
import { fetchOwnRequest, submitOwnResponse } from '../../../../lib/verificationApi';
import type { ArtistRequest } from '../../../../lib/verificationTypes';
import Page from './page';

const base: ArtistRequest = {
  id: 'req-9', round: 2, status: 'AWAITING_ARTIST_INPUT', message: 'We could not open your first link.',
  createdAt: '2026-10-01T00:00:00Z', completedAt: null, cancelledAt: null, submission: null,
  fields: [{ id: 'PORTFOLIO_URL', type: 'PORTFOLIO_URL', label: 'Portfolio link', instructions: 'Send a working link', required: true }],
};

beforeEach(() => vi.resetAllMocks());

describe('artist verification task page', () => {
  it('explains why, shows the generated form and the awaiting-input status', async () => {
    vi.mocked(fetchOwnRequest).mockResolvedValue(base);
    render(<Page />);
    expect(await screen.findByText('Verification request 2')).toBeTruthy();
    expect(screen.getByText(/Waiting for your response/)).toBeTruthy();
    expect(screen.getByText('We could not open your first link.')).toBeTruthy();
    expect(screen.getByLabelText(/Portfolio link/)).toBeTruthy();
    expect(screen.queryByText(/upload/i)).toBeNull();
  });

  it('submits, then confirms accurately that the response is awaiting review', async () => {
    vi.mocked(fetchOwnRequest)
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce({ ...base, status: 'AWAITING_REVIEW', submission: { responses: [{ fieldId: 'PORTFOLIO_URL', value: 'https://me.example' }], submittedAt: '2026-10-02T00:00:00Z' } });
    vi.mocked(submitOwnResponse).mockResolvedValue({ data: { status: 'AWAITING_REVIEW' } });

    render(<Page />);
    fireEvent.change(await screen.findByLabelText(/Portfolio link/), { target: { value: 'https://me.example' } });
    fireEvent.click(screen.getByText('Submit response'));

    await waitFor(() => expect(submitOwnResponse).toHaveBeenCalledWith('req-9', [{ fieldId: 'PORTFOLIO_URL', value: 'https://me.example' }]));
    expect(await screen.findByText(/now awaiting review/)).toBeTruthy();
    expect(screen.getByText('https://me.example')).toBeTruthy();
    expect(screen.queryByText('Submit response')).toBeNull();
  });

  it('shows server field errors next to the field', async () => {
    vi.mocked(fetchOwnRequest).mockResolvedValue(base);
    vi.mocked(submitOwnResponse).mockRejectedValue(
      new AdminApiError(400, 'x', 'VALIDATION_ERROR', [{ path: 'PORTFOLIO_URL', message: 'Only HTTPS links are accepted. Enter a full URL beginning with https://' }]),
    );
    render(<Page />);
    fireEvent.change(await screen.findByLabelText(/Portfolio link/), { target: { value: 'ftp://x' } });
    fireEvent.click(screen.getByText('Submit response'));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Only HTTPS links are accepted. Enter a full URL beginning with https://',
    );
  });

  it('refreshes and explains when the task changed underneath the artist', async () => {
    vi.mocked(fetchOwnRequest)
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce({ ...base, status: 'CANCELLED' });
    vi.mocked(submitOwnResponse).mockRejectedValue(new AdminApiError(409, 'This request was withdrawn', 'REQUEST_CANCELLED'));
    render(<Page />);
    fireEvent.change(await screen.findByLabelText(/Portfolio link/), { target: { value: 'https://me.example' } });
    fireEvent.click(screen.getByText('Submit response'));
    expect(await screen.findByText(/This request was cancelled/)).toBeTruthy();
  });

  it.each([
    ['COMPLETED', /This request is complete/, 'Completed'],
    ['CANCELLED', /was cancelled/, 'Cancelled'],
  ])('communicates a %s request accurately and offers no form', async (status, copy, label) => {
    vi.mocked(fetchOwnRequest).mockResolvedValue({ ...base, status: status as ArtistRequest['status'] });
    render(<Page />);
    expect(await screen.findByText(copy)).toBeTruthy();
    expect(screen.getByText(new RegExp(label))).toBeTruthy();
    expect(screen.queryByText('Submit response')).toBeNull();
  });

  it('treats someone else’s (or a missing) request as not found', async () => {
    vi.mocked(fetchOwnRequest).mockRejectedValue(new AdminApiError(404, 'Request not found', 'REQUEST_NOT_FOUND'));
    render(<Page />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not find that request/);
  });
});
