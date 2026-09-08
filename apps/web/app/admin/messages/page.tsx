'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import {
  fetchContactMessages,
  updateMessageStatus,
  type AdminContactMessage,
  type ContactMessageStatus,
} from '../../../lib/adminContactApi';

const STATUS_STYLES: Record<ContactMessageStatus, string> = {
  UNREAD: 'bg-accent/15 text-accent',
  READ: 'bg-foreground/10 text-foreground/70',
  REPLIED: 'bg-emerald-500/10 text-emerald-600',
  ARCHIVED: 'bg-foreground/5 text-muted',
};

function MessagesContent() {
  const [messages, setMessages] = useState<AdminContactMessage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetchContactMessages()
      .then(setMessages)
      .catch(() => setFailed(true));
  }, []);

  async function handleOpen(msg: AdminContactMessage) {
    setOpenId(openId === msg.id ? null : msg.id);
    if (msg.status === 'UNREAD') {
      try {
        const updated = await updateMessageStatus(msg.id, 'READ');
        setMessages((prev) => prev?.map((m) => (m.id === msg.id ? updated : m)) ?? prev);
      } catch {
        /* non-critical — the message still opens even if this fails */
      }
    }
  }

  async function handleStatusChange(id: string, status: ContactMessageStatus) {
    try {
      const updated = await updateMessageStatus(id, status);
      setMessages((prev) => prev?.map((m) => (m.id === id ? updated : m)) ?? prev);
    } catch {
      /* status change failed silently — the row just won't visually update */
    }
  }

  const unreadCount = messages?.filter((m) => m.status === 'UNREAD').length ?? 0;

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="font-display text-3xl text-foreground">Contact Messages</h1>
        <p className="text-sm text-muted">
          {unreadCount} unread message{unreadCount === 1 ? '' : 's'}
        </p>
      </div>

      {failed && (
        <p className="mt-8 text-sm text-red-500">Couldn&apos;t load messages right now.</p>
      )}

      {!failed && messages === null && (
        <div className="mt-8 space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      )}

      {!failed && messages !== null && messages.length === 0 && (
        <div className="mt-16 rounded-lg border border-border/10 bg-surface px-8 py-16 text-center">
          <p className="text-sm text-muted">No messages yet.</p>
        </div>
      )}

      {!failed && messages !== null && messages.length > 0 && (
        <ul className="mt-8 flex flex-col gap-3">
          {messages.map((msg) => (
            <li key={msg.id} className="rounded-lg border border-border/10 bg-surface">
              <button
                type="button"
                onClick={() => void handleOpen(msg)}
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLES[msg.status]}`}
                    >
                      {msg.status}
                    </span>
                    <span className="truncate font-display text-base text-foreground">
                      {msg.subject}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted">
                    {msg.name} · {msg.email}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {new Date(msg.createdAt).toLocaleDateString()}
                </span>
              </button>

              {openId === msg.id && (
                <div className="border-t border-border/10 px-6 py-5">
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">{msg.message}</p>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {(['READ', 'REPLIED', 'ARCHIVED'] as ContactMessageStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => void handleStatusChange(msg.id, status)}
                        disabled={msg.status === status}
                        className="rounded-full border border-border/15 px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Mark {status.toLowerCase()}
                      </button>
                    ))}
                  </div>

                  <p className="mt-3 text-xs text-muted">
                    {msg.emailSentAt
                      ? `Email notification sent ${new Date(msg.emailSentAt).toLocaleString()}`
                      : msg.emailError
                        ? `Email notification failed: ${msg.emailError}`
                        : 'Email notification status unknown'}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminMessagesPage() {
  return (
    <ProtectedRoute allowRoles={['ADMIN']}>
      <MessagesContent />
    </ProtectedRoute>
  );
}
