'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import {
  EmptyBox,
  ErrorBox,
  PageHeader,
  Pagination,
  StatusPill,
} from '../../../components/admin/AdminUi';
import {
  fetchAdminUsers,
  type AdminUserRow,
  type ListUsersParams,
  type Pagination as PaginationData,
} from '../../../lib/adminApi';

const STATUSES = ['ACTIVE', 'PENDING_VERIFICATION', 'RESTRICTED', 'SUSPENDED', 'BANNED', 'DEACTIVATED'];
const ROLES = ['BUYER', 'ARTIST', 'MODERATOR', 'FINANCE_ADMIN', 'ADMIN'];

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function AdminUsersPage() {
  const [filters, setFilters] = useState<ListUsersParams>({ page: 1, sort: 'createdAt', dir: 'desc' });
  const [searchInput, setSearchInput] = useState('');
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setRows(null);
    fetchAdminUsers(filters)
      .then((result) => {
        setRows(result.data);
        setPagination(result.pagination ?? null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load users.'),
      );
  }, [filters]);

  useEffect(load, [load]);

  // Debounce typing so each keystroke is not a database query.
  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters((f) => ((f.search ?? '') === searchInput.trim() ? f : { ...f, page: 1, search: searchInput.trim() || undefined }));
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const update = (patch: Partial<ListUsersParams>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  const selectClass =
    'rounded-md border border-border/15 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Marketplace"
        title="Users"
        description="Search accounts, review their standing, and take enforcement action."
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs text-muted">
          Search
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Name, email or artist name"
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Status
          <select className={selectClass} value={filters.status ?? ''} onChange={(e) => update({ status: e.target.value || undefined })}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Role
          <select className={selectClass} value={filters.role ?? ''} onChange={(e) => update({ role: e.target.value || undefined })}>
            <option value="">All</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r.replace(/_/g, ' ').toLowerCase()}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Sort by
          <select
            className={selectClass}
            value={`${filters.sort}:${filters.dir}`}
            onChange={(e) => {
              const [sort, dir] = e.target.value.split(':') as [ListUsersParams['sort'], ListUsersParams['dir']];
              update({ sort, dir });
            }}
          >
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="lastName:asc">Last name A–Z</option>
            <option value="email:asc">Email A–Z</option>
          </select>
        </label>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {!error && !rows && (
        <div className="space-y-2" role="status" aria-label="Loading users">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      )}

      {rows && rows.length === 0 && (
        <EmptyBox
          title="No users match these filters"
          description="Try clearing the search or choosing a different status or role."
        />
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border/10 bg-surface">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-border/10 text-xs uppercase tracking-[0.12em] text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">User</th>
                <th scope="col" className="px-4 py-3 font-medium">Roles</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
              {rows.map((user) => (
                <tr key={user.id} className="transition-colors hover:bg-surface-raised">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${user.id}` as Route}
                      className="font-medium text-foreground underline-offset-4 hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {user.firstName} {user.lastName}
                    </Link>
                    <p className="text-xs text-muted">{user.email}</p>
                    {user.artistProfile && (
                      <p className="text-xs text-muted">Artist: {user.artistProfile.displayName}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {user.roles.map((r) => r.replace(/_/g, ' ').toLowerCase()).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3"><StatusPill status={user.status} /></td>
                  <td className="px-4 py-3 text-xs text-muted">{dateFormat.format(new Date(user.createdAt))}</td>
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
