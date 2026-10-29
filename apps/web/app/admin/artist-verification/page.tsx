'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { EmptyBox, ErrorBox, PageHeader, Pagination } from '../../../components/admin/AdminUi';
import type { Pagination as PaginationData } from '../../../lib/adminApi';
import { fetchVerificationQueue, type QueueRow } from '../../../lib/verificationApi';
import { REQUEST_STATUS } from '../../../lib/verificationStatus';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function nextAction(row: QueueRow): string {
  if (!row.openRequest) return 'No Active Request';
  return REQUEST_STATUS[row.openRequest.status].waitingOn === 'artist'
    ? 'Waiting on the artist'
    : 'Needs your review';
}

export default function ArtistVerificationQueuePage() {
  const [filters, setFilters] = useState<{ page: number; search?: string; state?: string }>({
    page: 1,
  });
  const [searchInput, setSearchInput] = useState('');
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setRows(null);
    fetchVerificationQueue(filters)
      .then((r) => {
        setRows(r.data);
        setPagination(r.pagination ?? null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load applications.'),
      );
  }, [filters]);

  useEffect(load, [load]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters((f) =>
        (f.search ?? '') === searchInput.trim()
          ? f
          : { ...f, page: 1, search: searchInput.trim() || undefined },
      );
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const field =
    'rounded-md border border-border/15 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Marketplace"
        title="Artist verification"
        description="Applications from artists who are waiting to be verified. Verified artists can sell and accept commissions."
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs text-muted">
          Search
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Artist name, person or email"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Status
          <select
            className={field}
            value={filters.state ?? ''}
            onChange={(e) =>
              setFilters((f) => ({ ...f, page: 1, state: e.target.value || undefined }))
            }
          >
            <option value="">All pending</option>
            <option value="NO_ACTIVE_REQUEST">No active request</option>
            <option value="AWAITING_ARTIST_INPUT">Awaiting artist input</option>
            <option value="AWAITING_REVIEW">Awaiting review</option>
          </select>
        </label>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {!error && !rows && (
        <div className="space-y-2" role="status" aria-label="Loading applications">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      )}
      {rows && rows.length === 0 && (
        <EmptyBox
          title="No applications to review"
          description="Artists appear here while their verification is pending."
        />
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border/10 bg-surface">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-border/10 text-xs uppercase tracking-[0.12em] text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Artist
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Request status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Next step
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Applied
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
              {rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-surface-raised">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/artist-verification/${row.id}` as Route}
                      className="font-medium text-foreground underline-offset-4 hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {row.displayName}
                    </Link>
                    <p className="text-xs text-muted">
                      {row.user.firstName} {row.user.lastName} · {row._count.artworks} artwork
                      {row._count.artworks === 1 ? '' : 's'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {row.openRequest
                      ? `Round ${row.openRequest.round}: ${REQUEST_STATUS[row.openRequest.status].staff}`
                      : 'No active request'}
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground/80">{nextAction(row)}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {dateFormat.format(new Date(row.createdAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
