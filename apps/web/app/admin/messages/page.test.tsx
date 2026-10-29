import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchContactMessages, updateMessageStatus } = vi.hoisted(() => ({
  fetchContactMessages: vi.fn(),
  updateMessageStatus: vi.fn(),
}));

vi.mock('../../../components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../../components/admin/AdminSessionContext', () => ({
  useAdminSession: () => ({ can: () => true }),
}));
vi.mock('../../../lib/adminApi', () => ({ STAFF_ROLE_NAMES: ['ADMIN', 'MODERATOR'] }));
vi.mock('../../../lib/adminContactApi', () => ({
  AdminContactApiError: class AdminContactApiError extends Error {
    constructor(message: string, public status: number, public code?: string) { super(message); }
  },
  fetchContactMessages,
  updateMessageStatus,
}));

import Page from './page';
import { AdminContactApiError, type AdminContactMessage, type ContactMessagePage } from '../../../lib/adminContactApi';

const message = (id: string, status: AdminContactMessage['status'] = 'UNREAD'): AdminContactMessage => ({
  id, name: 'Ada Lovelace', email: 'ada@example.com', subject: `Question ${id}`,
  message: 'Please help.', status, emailSentAt: null, emailError: null, createdAt: '2026-10-01T00:00:00Z',
});

function page(data: AdminContactMessage[], total = data.length, pageNumber = 1, totalPages = 1, unreadTotal = 1): ContactMessagePage {
  return { data, pagination: { page: pageNumber, pageSize: 20, total, totalPages, unreadTotal } };
}

beforeEach(() => vi.resetAllMocks());

describe('admin contact support inbox', () => {
  it('requests the Inbox view, then loads Archived and uses each view total', async () => {
    fetchContactMessages.mockResolvedValueOnce(page([message('inbox')], 4, 1, 1, 2))
      .mockResolvedValueOnce(page([message('archived', 'ARCHIVED')], 3, 1, 1, 0));
    render(<Page />);

    expect(await screen.findByText('2 unread messages · 4 total')).toBeTruthy();
    expect(fetchContactMessages).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 20, view: 'INBOX' });

    fireEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    expect(await screen.findByText('3 archived messages')).toBeTruthy();
    expect(screen.getByText('Question archived')).toBeTruthy();
    expect(fetchContactMessages).toHaveBeenNthCalledWith(2, { page: 1, pageSize: 20, view: 'ARCHIVED' });
  });

  it('removes an archived message from Inbox and reloads the current view', async () => {
    fetchContactMessages.mockResolvedValueOnce(page([message('one', 'READ')], 1, 1, 1, 0))
      .mockResolvedValueOnce(page([], 0, 1, 0, 0));
    updateMessageStatus.mockResolvedValue(message('one', 'ARCHIVED'));
    render(<Page />);

    fireEvent.click(await screen.findByRole('button', { name: /Question one/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark archived' }));

    expect(await screen.findByText('No messages in your inbox.')).toBeTruthy();
    await waitFor(() => expect(fetchContactMessages).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Question one')).toBeNull();
  });

  it('moves back when archiving empties the current page', async () => {
    fetchContactMessages.mockResolvedValueOnce(page(Array.from({ length: 20 }, (_, i) => message(`first-${i}`, 'READ')), 21, 1, 2, 0))
      .mockResolvedValueOnce(page([message('older', 'READ')], 21, 2, 2, 0))
      .mockResolvedValueOnce(page([message('newer')], 20, 1, 1, 0));
    updateMessageStatus.mockResolvedValue(message('older', 'ARCHIVED'));
    render(<Page />);
    await screen.findByText('Question first-0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Question older');
    expect(screen.getByRole('navigation', { name: 'Contact message pagination' }).textContent).toContain('Page 2 of 2');

    fireEvent.click(screen.getByRole('button', { name: /Question older/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark archived' }));
    expect(await screen.findByText('Question newer')).toBeTruthy();
    await waitFor(() => expect(fetchContactMessages).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, view: 'INBOX' }));
  });

  it('shows action failures, restores controls, and refreshes after a stale conflict', async () => {
    fetchContactMessages.mockResolvedValueOnce(page([message('one', 'READ')], 1, 1, 1, 0))
      .mockResolvedValueOnce(page([]));
    updateMessageStatus.mockRejectedValueOnce(new Error('The server could not update the message.'))
      .mockRejectedValueOnce(new AdminContactApiError('stale', 409));
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /Question one/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Mark archived' }));
    expect(await screen.findByText('The server could not update the message.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark archived' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Mark archived' }));
    expect(await screen.findByText('This message changed elsewhere. Its latest status is being refreshed.')).toBeTruthy();
    await waitFor(() => expect(fetchContactMessages).toHaveBeenCalledTimes(2));
  });

  it('retries a failed initial queue load', async () => {
    fetchContactMessages.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(page([]));
    render(<Page />);
    expect(await screen.findByText('Network unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No messages in your inbox.')).toBeTruthy();
  });

  it('prevents duplicate submissions while a status request is pending', async () => {
    let resolveUpdate!: (row: AdminContactMessage) => void;
    updateMessageStatus.mockReturnValueOnce(new Promise((resolve) => { resolveUpdate = resolve; }));
    fetchContactMessages.mockResolvedValueOnce(page([message('one', 'READ')], 1, 1, 1, 0));
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /Question one/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark archived' }));
    expect(screen.getAllByRole('button', { name: 'Updating…' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Updating…' }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(updateMessageStatus).toHaveBeenCalledTimes(1);
    await act(async () => resolveUpdate(message('one', 'ARCHIVED')));
  });
});
