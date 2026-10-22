import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/adminApi', () => ({ adminRequest: vi.fn() }));

import { adminRequest } from '../lib/adminApi';
import { NotificationFeed, type NotificationItem } from './NotificationFeed';

const item = (over: Partial<NotificationItem>): NotificationItem => ({
  id: 'n1', type: 'VERIFICATION_INFO_REQUESTED', title: 'More information needed for your verification',
  message: 'Our team needs a little more information.', link: '/studio/verification/req-9',
  read: false, createdAt: '2026-10-01T10:00:00Z', ...over,
});

function feed(notifications: NotificationItem[], unreadCount = notifications.filter((n) => !n.read).length) {
  vi.mocked(adminRequest).mockImplementation((async (method: string) =>
    method === 'GET'
      ? { data: { notifications, unreadCount } }
      : { data: { updated: 1 } }) as never);
}

beforeEach(() => vi.resetAllMocks());

describe('NotificationFeed', () => {
  it('loads from the authenticated API and shows the unread count', async () => {
    feed([item({}), item({ id: 'n2', read: true, title: 'Older notice' })]);
    render(<NotificationFeed />);
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    expect(vi.mocked(adminRequest)).toHaveBeenCalledWith('GET', '/notifications');
    fireEvent.click(bell);
    expect(screen.getByText('More information needed for your verification')).toBeTruthy();
  });

  it('links the notification to the artist-facing task, and marks it read when followed', async () => {
    feed([item({})]);
    render(<NotificationFeed />);
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    const link = screen.getByRole('link', { name: /More information needed/ });
    expect(link.getAttribute('href')).toBe('/studio/verification/req-9');
    expect(link.getAttribute('href')).not.toMatch(/admin/);

    link.addEventListener('click', (e) => e.preventDefault()); // keep jsdom from attempting a real navigation
    fireEvent.click(link);
    await waitFor(() =>
      expect(vi.mocked(adminRequest)).toHaveBeenCalledWith('PATCH', '/notifications/read', { body: { notificationIds: ['n1'] } }),
    );
  });

  it('does not make a link out of a notification that has none', async () => {
    feed([item({ link: null, title: 'Plain notice' })]);
    render(<NotificationFeed />);
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    expect(screen.getByText('Plain notice')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('can mark everything read, and shows an empty state', async () => {
    feed([item({}), item({ id: 'n2', title: 'Second notice' })]);
    render(<NotificationFeed />);
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    fireEvent.click(screen.getByText('Mark all read'));
    await waitFor(() =>
      expect(vi.mocked(adminRequest)).toHaveBeenCalledWith('PATCH', '/notifications/read', { body: {} }),
    );
    await waitFor(() => expect(screen.queryByText('Mark all read')).toBeNull());
  });

  it('shows an empty state and an honest error state', async () => {
    feed([]);
    const { unmount } = render(<NotificationFeed />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(screen.getByText('You are all caught up.')).toBeTruthy();
    unmount();

    vi.mocked(adminRequest).mockRejectedValue(new Error('401'));
    render(<NotificationFeed />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not load/);
  });
});
