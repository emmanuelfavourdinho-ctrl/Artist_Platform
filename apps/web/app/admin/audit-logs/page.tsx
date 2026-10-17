'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { EmptyBox, ErrorBox, PageHeader, Pagination } from '../../../components/admin/AdminUi';
import {
  fetchAuditLogs,
  type AuditEntry,
  type ListAuditParams,
  type Pagination as PaginationData,
} from '../../../lib/adminApi';

const ACTIONS = [
  'USER_STATUS_CHANGED',
  'USER_WARNED',
  'USER_ROLE_UPDATED',
  'ARTIST_VERIFICATION_CHANGED',
  'ARTWORK_MODERATED',
  'REVIEW_APPROVED',
  'REVIEW_REJECTED',
  'REPORT_REVIEWED',
  'ORDER_STATUS_CHANGED',
  'SYSTEM_SETTING_CHANGED',
];

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function AuditContent() {
  const entityId = useSearchParams().get('entityId') ?? undefined;
  const [filters, setFilters] = useState<ListAuditParams>({ page: 1, entityId });
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setRows(null);
    fetchAuditLogs(filters)
      .then((result) => {
        setRows(result.data);
        setPagination(result.pagination ?? null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load the audit log.'),
      );
  }, [filters]);

  useEffect(load, [load]);

  const field =
    'rounded-md border border-border/15 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Platform"
        title="Audit logs"
        description="A permanent, read-only record of administrative actions. Entries cannot be edited or deleted."
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Action
          <select
            className={field}
            value={filters.action ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, page: 1, action: e.target.value || undefined }))}
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, ' ').toLowerCase()}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          From
          <input type="date" className={field} onChange={(e) => setFilters((f) => ({ ...f, page: 1, from: e.target.value || undefined }))} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          To
          <input
            type="date"
            className={field}
            onChange={(e) =>
              setFilters((f) => ({ ...f, page: 1, to: e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined }))
            }
          />
        </label>
        {filters.entityId && (
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, page: 1, entityId: undefined }))}
            className="rounded-md border border-border/15 px-3 py-2 text-xs text-foreground/80 hover:border-accent"
          >
            Clear user filter ✕
          </button>
        )}
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {!error && !rows && (
        <div className="space-y-2" role="status" aria-label="Loading audit log">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      )}
      {rows && rows.length === 0 && (
        <EmptyBox
          title="No audit entries match"
          description="Entries appear here as administrators take action."
        />
      )}

      {rows && rows.length > 0 && (
        <ol className="space-y-3">
          {rows.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-border/10 bg-surface px-5 py-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-foreground">{entry.action.replace(/_/g, ' ').toLowerCase()}</p>
                <time dateTime={entry.createdAt} className="text-xs text-muted">
                  {dateTime.format(new Date(entry.createdAt))}
                </time>
              </div>
              <p className="mt-1 text-xs text-muted">
                By {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'System (automatic)'} ·{' '}
                {entry.entityType}
                {entry.entityId ? ` ${entry.entityId}` : ''}
              </p>
              {entry.reason && <p className="mt-2 text-foreground/80">{entry.reason}</p>}
              {entry.metadata && (
                <details className="mt-2 text-xs text-muted">
                  <summary className="cursor-pointer">Details</summary>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-background p-3">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}

      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onChange={(page) => setFilters((f) => ({ ...f, page }))}
        />
      )}
    </div>
  );
}

export default function AuditLogsPage() {
  return (
    <Suspense fallback={null}>
      <AuditContent />
    </Suspense>
  );
}
