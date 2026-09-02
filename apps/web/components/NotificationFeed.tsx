'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export function NotificationFeed({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/notifications`, { headers: { Accept: 'application/json' } })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setNotifications(json.data.notifications);
          setUnreadCount(json.data.unreadCount);
        }
      })
      .catch(console.error);

    const socket: Socket = io(`${API_URL}/notifications`, { transports: ['websocket'] });
    socket.emit('join_user_channel', userId);

    socket.on('new_notification', (item: NotificationItem) => {
      setNotifications((prev) => [item, ...prev]);
      setUnreadCount((prev) => prev + 1);
    });

    return () => {
      socket.emit('leave_user_channel', userId);
      socket.disconnect();
    };
  }, [userId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await fetch(`${API_URL}/api/v1/notifications/read`, { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark notifications read:', err);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 rounded-full text-[rgb(var(--foreground))] hover:bg-[rgb(var(--surface-raised))] transition-colors"
        aria-label="Activity Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 text-[10px] font-mono font-bold bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] flex items-center justify-center rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 md:w-96 bg-[rgb(var(--surface))] border border-[rgb(var(--border)/0.15)] rounded-[var(--radius-lg)] shadow-2xl z-50 overflow-hidden divide-y divide-[rgb(var(--border)/0.08)]">
          <div className="p-4 flex justify-between items-center bg-[rgb(var(--background))]">
            <span className="text-xs uppercase tracking-wider font-mono text-[rgb(var(--muted))]">
              Activity Stream
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-[rgb(var(--accent))] hover:underline font-mono"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-[rgb(var(--border)/0.06)]">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-[rgb(var(--muted))] font-mono">
                No recent activity.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 transition-colors ${
                    !n.read
                      ? 'bg-[rgb(var(--accent)/0.04)]'
                      : 'hover:bg-[rgb(var(--surface-raised))]'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="font-['Fraunces'] text-sm font-normal text-[rgb(var(--foreground))]">
                      {n.title}
                    </h4>
                    <span className="text-[10px] text-[rgb(var(--muted))] font-mono whitespace-nowrap">
                      {new Date(n.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-[rgb(var(--muted))] mt-1 leading-relaxed">
                    {n.message}
                  </p>
                  {n.link && (
                    <Link
                      href={n.link as Route}
                      onClick={() => setIsOpen(false)}
                      className="inline-block mt-2 text-xs font-mono text-[rgb(var(--accent))] hover:underline"
                    >
                      View details →
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
