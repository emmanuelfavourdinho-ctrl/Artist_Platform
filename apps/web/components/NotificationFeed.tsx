'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { adminRequest } from '../lib/adminApi';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  /** App-relative task link, or null. The API only ever returns safe paths. */
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface FeedResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

const POLL_MS = 60_000;
const dateTime = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/*
  Explainer: a bell that shows the signed-in user's persisted notifications.
  It loads from the authenticated REST API (sending the Firebase token via
  the shared request helper — the old version sent none, so it always got a
  401) and re-checks every minute and whenever it is opened. There is no
  socket: the persisted notification and the dashboard task are the source
  of truth, so nothing depends on real-time push being available.
  Reading a notification never removes the underlying task from the studio.
*/
export function NotificationFeed() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await adminRequest<FeedResponse>('GET', '/notifications');
      setItems(data.notifications);
      setUnread(data.unreadCount);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  async function markRead(ids?: string[]) {
    try {
      await adminRequest('PATCH', '/notifications/read', { body: ids ? { notificationIds: ids } : {} });
      setItems((prev) => prev.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)));
      setUnread((prev) => (ids ? Math.max(0, prev - ids.length) : 0));
    } catch {
      /* Leave it unread; the next refresh shows the true state. */
    }
  }

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative rounded-full px-2.5 py-1.5 text-[13px] font-medium uppercase tracking-[0.12em] text-foreground/80 transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        Alerts
        {unread > 0 && (
          <span className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-3 w-80 overflow-hidden rounded-lg border border-border/15 bg-surface shadow-2xl md:w-96">
          <div className="flex items-center justify-between border-b border-border/10 bg-background px-4 py-3">
            <span className="text-xs uppercase tracking-wider text-muted">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={() => void markRead()} className="text-xs text-accent hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {failed && <p role="alert" className="p-4 text-sm text-red-300">Could not load notifications.</p>}
            {!failed && items.length === 0 && <p className="p-6 text-center text-sm text-muted">You are all caught up.</p>}
            <ul className="divide-y divide-border/10">
              {items.map((n) => {
                const content = (
                  <div className={`px-4 py-3 text-sm ${n.read ? '' : 'bg-accent/5'}`}>
                    <p className="flex items-center gap-2 font-medium text-foreground">
                      {!n.read && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />}
                      {n.title}
                      {!n.read && <span className="sr-only">(unread)</span>}
                    </p>
                    <p className="mt-1 text-foreground/80">{n.message}</p>
                    <p className="mt-1 text-xs text-muted">{dateTime.format(new Date(n.createdAt))}</p>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link
                        href={n.link as Route}
                        onClick={() => {
                          setOpen(false);
                          if (!n.read) void markRead([n.id]);
                        }}
                        className="block transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
