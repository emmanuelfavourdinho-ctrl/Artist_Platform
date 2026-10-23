'use client';

import { useEffect, useRef, useState } from 'react';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { useAdminSession } from '../../../components/admin/AdminSessionContext';
import { STAFF_ROLE_NAMES } from '../../../lib/adminApi';
import {
  AdminContactApiError,
  fetchContactMessages,
  updateMessageStatus,
  type AdminContactMessage,
  type ContactMessagePagination,
  type ContactMessageStatus,
  type ContactMessageView,
} from '../../../lib/adminContactApi';

const PAGE_SIZE = 20;

const STATUS_STYLES: Record<ContactMessageStatus, string> = {
  UNREAD: 'bg-accent/15 text-accent',
  READ: 'bg-foreground/10 text-foreground/70',
  REPLIED: 'bg-emerald-500/10 text-emerald-600',
  ARCHIVED: 'bg-foreground/5 text-muted',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function MessagesContent() {
  const { can } = useAdminSession();
  const canManageSupport = can('support.manage');
  const [messages, setMessages] = useState<AdminContactMessage[] | null>(null);
  const [pagination, setPagination] = useState<ContactMessagePagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<ContactMessageView>('INBOX');
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const pendingRef = useRef<Set<string>>(new Set());
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!canManageSupport) return;

    let cancelled = false;
    let correctingPage = false;
    setLoading(true);
    setLoadError(null);

    async function loadMessages() {
      try {
        const result = await fetchContactMessages({ page, pageSize: PAGE_SIZE, view });
        if (cancelled) return;

        const lastPage = Math.max(1, result.pagination.totalPages);
        if (page > lastPage) {
          correctingPage = true;
          setPage(lastPage);
          return;
        }

        setMessages(result.data);
        setPagination(result.pagination);
      } catch (error) {
        if (!cancelled) setLoadError(error);
      } finally {
        if (!cancelled && !correctingPage) setLoading(false);
      }
    }

    void loadMessages();
    return () => {
      cancelled = true;
    };
  }, [canManageSupport, page, refreshKey, view]);

  function beginAction(id: string): boolean {
    if (pendingRef.current.has(id)) return false;
    const next = new Set(pendingRef.current);
    next.add(id);
    pendingRef.current = next;
    setPendingIds(next);
    setActionErrors((current) => {
      const updated = { ...current };
      delete updated[id];
      return updated;
    });
    return true;
  }

  function finishAction(id: string) {
    const next = new Set(pendingRef.current);
    next.delete(id);
    pendingRef.current = next;
    setPendingIds(next);
  }

  function showActionError(id: string, error: unknown) {
    const stale = error instanceof AdminContactApiError && error.status === 409;
    setActionErrors((current) => ({
      ...current,
      [id]: stale
        ? 'This message changed elsewhere. Its latest status is being refreshed.'
        : errorMessage(error),
    }));
    if (stale) setRefreshKey((key) => key + 1);
  }

  function applyUpdate(updated: AdminContactMessage, previousStatus: ContactMessageStatus) {
    const leavesView = view === 'INBOX' ? updated.status === 'ARCHIVED' : updated.status !== 'ARCHIVED';
    if (leavesView) {
      const remainingCount = Math.max(0, (messages?.length ?? 0) - 1);
      const nextTotal = Math.max(0, (pagination?.total ?? 0) - 1);
      const nextTotalPages = Math.ceil(nextTotal / PAGE_SIZE);
      if (remainingCount === 0 && page > 1) {
        setPage(Math.min(page - 1, Math.max(1, nextTotalPages)));
      }
      setMessages((current) => current?.filter((message) => message.id !== updated.id) ?? current);
      setPagination((current) => {
        if (!current) return current;
        const total = Math.max(0, current.total - 1);
        const totalPages = Math.ceil(total / current.pageSize);
        return { ...current, total, totalPages };
      });
      setOpenId((current) => (current === updated.id ? null : current));
      setRefreshKey((key) => key + 1);
    } else {
      setMessages((current) => current?.map((message) => (message.id === updated.id ? updated : message)) ?? current);
    }
    setPagination((current) => {
      if (!current || previousStatus === updated.status) return current;
      const unreadDelta = Number(updated.status === 'UNREAD') - Number(previousStatus === 'UNREAD');
      return { ...current, unreadTotal: Math.max(0, current.unreadTotal + unreadDelta) };
    });
  }

  async function handleOpen(message: AdminContactMessage) {
    setOpenId((current) => (current === message.id ? null : message.id));
    if (message.status !== 'UNREAD' || !beginAction(message.id)) return;

    try {
      const updated = await updateMessageStatus(message.id, 'READ');
      applyUpdate(updated, message.status);
    } catch (error) {
      showActionError(message.id, error);
    } finally {
      finishAction(message.id);
    }
  }

  async function handleStatusChange(message: AdminContactMessage, status: ContactMessageStatus) {
    if (!beginAction(message.id)) return;
    try {
      const updated = await updateMessageStatus(message.id, status);
      applyUpdate(updated, message.status);
    } catch (error) {
      showActionError(message.id, error);
    } finally {
      finishAction(message.id);
    }
  }

  function retryLoad() {
    setRefreshKey((key) => key + 1);
  }

  if (!canManageSupport) {
    return (
      <div>
        <h1 className="font-display text-3xl text-foreground">Contact Messages</h1>
        <p role="alert" className="mt-8 text-sm text-red-500">
          You do not have permission to manage contact messages.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-8 space-y-3" aria-busy="true" role="status" aria-label="Loading contact messages">
        {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-surface" />)}
      </div>
    );
  }

  if (loadError) {
    const permissionDenied = loadError instanceof AdminContactApiError && loadError.status === 403;
    return (
      <div>
        <h1 className="font-display text-3xl text-foreground">Contact Messages</h1>
        <p role="alert" className="mt-8 text-sm text-red-500">{errorMessage(loadError)}</p>
        {!permissionDenied && (
          <button type="button" onClick={retryLoad} className="mt-3 text-sm text-accent underline">
            Try again
          </button>
        )}
      </div>
    );
  }

  const unreadTotal = pagination?.unreadTotal ?? 0;
  const totalPages = pagination?.totalPages ?? 0;

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="font-display text-3xl text-foreground">Contact Messages</h1>
      </div>

      <div role="tablist" aria-label="Contact message view" className="mt-6 flex gap-2">
        {(['INBOX', 'ARCHIVED'] as ContactMessageView[]).map((nextView) => (
          <button
            key={nextView}
            type="button"
            role="tab"
            aria-selected={view === nextView}
            onClick={() => { setPage(1); setView(nextView); setOpenId(null); }}
            className={`rounded-full px-4 py-2 text-xs font-medium ${view === nextView ? 'bg-accent text-white' : 'border border-border/20 text-muted'}`}
          >
            {nextView === 'INBOX' ? 'Inbox' : 'Archived'}
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm text-muted">
        {view === 'INBOX'
          ? `${unreadTotal} unread message${unreadTotal === 1 ? '' : 's'} · ${pagination?.total ?? 0} total`
          : `${pagination?.total ?? 0} archived message${pagination?.total === 1 ? '' : 's'}`}
      </p>

      {messages?.length === 0 && (
        <div className="mt-16 rounded-lg border border-border/10 bg-surface px-8 py-16 text-center">
          <p className="text-sm text-muted">{view === 'INBOX' ? 'No messages in your inbox.' : 'No archived messages.'}</p>
        </div>
      )}

      {!!messages?.length && (
        <ul className="mt-8 flex flex-col gap-3">
          {messages.map((message) => {
            const pending = pendingIds.has(message.id);
            return (
              <li key={message.id} className="rounded-lg border border-border/10 bg-surface">
                <button
                  type="button"
                  onClick={() => void handleOpen(message)}
                  aria-expanded={openId === message.id}
                  className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLES[message.status]}`}>
                        {message.status}
                      </span>
                      <span className="truncate font-display text-base text-foreground">{message.subject}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted">{message.name} · {message.email}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{new Date(message.createdAt).toLocaleDateString()}</span>
                </button>

                {openId === message.id && (
                  <div className="border-t border-border/10 px-6 py-5">
                    <p className="whitespace-pre-wrap text-sm text-foreground/90">{message.message}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {(['READ', 'REPLIED', 'ARCHIVED'] as ContactMessageStatus[]).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => void handleStatusChange(message, status)}
                          disabled={pending || message.status === status}
                          className="rounded-full border border-border/15 px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {pending ? 'Updating…' : `Mark ${status.toLowerCase()}`}
                        </button>
                      ))}
                    </div>

                    {actionErrors[message.id] && (
                      <p role="alert" className="mt-3 text-xs text-red-500">{actionErrors[message.id]}</p>
                    )}
                    <p className="mt-3 text-xs text-muted">
                      {message.emailSentAt
                        ? `Email notification sent ${new Date(message.emailSentAt).toLocaleString()}`
                        : message.emailError
                          ? `Email notification failed: ${message.emailError}`
                          : 'Email notification status unknown'}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pagination && pagination.totalPages > 1 && (
        <nav aria-label="Contact message pagination" className="mt-8 flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-full border border-foreground/25 px-4 py-2 text-xs disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-muted">Page {page} of {totalPages}</span>
          <button
            type="button"
            disabled={loading || page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            className="rounded-full border border-foreground/25 px-4 py-2 text-xs disabled:opacity-50"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}

export default function AdminMessagesPage() {
  return (
    <ProtectedRoute allowRoles={STAFF_ROLE_NAMES}>
      <MessagesContent />
    </ProtectedRoute>
  );
}
