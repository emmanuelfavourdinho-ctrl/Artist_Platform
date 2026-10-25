'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAdminSession } from '../../../components/admin/AdminSessionContext';
import { EmptyBox, ErrorBox, PageHeader, Pagination } from '../../../components/admin/AdminUi';
import {
  fetchAdminFinancialActivities,
  type AdminFinanceParams,
  type AdminFinancialActivity,
  type Pagination as PaginationData,
} from '../../../lib/adminApi';

const PAGE_SIZE = 20;

function dateBounds(from: string, to: string) {
  return {
    ...(from ? { from: `${from}T00:00:00.000Z` } : {}),
    ...(to ? { to: `${to}T23:59:59.999Z` } : {}),
  };
}

function timestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not provided by provider';
}

export default function AdminFinancePage() {
  const allowed = useAdminSession().can('finance.view');
  const [filters, setFilters] = useState({
    movementType: '',
    provider: '',
    currency: '',
    from: '',
    to: '',
    reference: '',
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminFinancialActivity[] | null>(null);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const params: AdminFinanceParams = {
        page,
        pageSize: PAGE_SIZE,
        ...(appliedFilters.movementType ? { movementType: appliedFilters.movementType } : {}),
        ...(appliedFilters.provider ? { provider: appliedFilters.provider.trim() } : {}),
        ...(appliedFilters.currency ? { currency: appliedFilters.currency.trim() } : {}),
        ...dateBounds(appliedFilters.from, appliedFilters.to),
        ...(appliedFilters.reference ? { reference: appliedFilters.reference.trim() } : {}),
      };
      const result = await fetchAdminFinancialActivities(params);
      if (currentRequestId !== requestId.current) return;
      setRows(result.data);
      setPagination(result.pagination ?? null);
    } catch (err) {
      if (currentRequestId !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'Could not load financial activity.');
    } finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }, [appliedFilters, page]);

  useEffect(() => {
    if (allowed) void load();
    return () => {
      requestId.current += 1;
    };
  }, [allowed, load]);

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    requestId.current += 1;
    setPage(1);
    setAppliedFilters(filters);
  };

  if (!allowed) {
    return (
      <p role="alert" className="text-sm text-red-400">
        You do not have permission to view financial activity.
      </p>
    );
  }

  const field =
    'rounded-md border border-border/15 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Platform"
        title="Financial activity"
        description="Append-only activity recorded from verified provider events. Amounts remain separated by currency; this is not a double-entry ledger."
      />
      <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-foreground/80">
        Checkout payment confirmation is not provider settlement or artist payout. This register
        currently records verified checkout payment confirmations only; it does not infer fees,
        refunds, disputes, settlements, or payouts.
      </p>

      <form onSubmit={submitFilters} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Activity type
          <select
            className={field}
            value={filters.movementType}
            onChange={(event) =>
              setFilters((current) => ({ ...current, movementType: event.target.value }))
            }
          >
            <option value="">All recorded types</option>
            <option value="CHECKOUT_PAYMENT_CONFIRMED">Checkout payment confirmed</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Provider
          <input
            className={field}
            value={filters.provider}
            onChange={(event) =>
              setFilters((current) => ({ ...current, provider: event.target.value }))
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Currency
          <input
            className={field}
            value={filters.currency}
            maxLength={3}
            placeholder="USD"
            onChange={(event) =>
              setFilters((current) => ({ ...current, currency: event.target.value.toUpperCase() }))
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Recorded from
          <input
            type="date"
            className={field}
            value={filters.from}
            onChange={(event) =>
              setFilters((current) => ({ ...current, from: event.target.value }))
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Recorded through
          <input
            type="date"
            className={field}
            value={filters.to}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted lg:col-span-2">
          Movement, provider, order, or payment reference
          <input
            className={field}
            value={filters.reference}
            maxLength={255}
            onChange={(event) =>
              setFilters((current) => ({ ...current, reference: event.target.value }))
            }
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-accent px-4 py-2 text-sm text-accent hover:bg-accent/5"
        >
          Apply filters
        </button>
      </form>

      {error && <ErrorBox message={error} onRetry={() => void load()} />}
      {loading && (
        <div
          role="status"
          aria-label="Loading financial activity"
          className="h-24 animate-pulse rounded-lg bg-surface"
        />
      )}
      {!loading && !error && rows?.length === 0 && (
        <EmptyBox
          title="No financial activity found"
          description="No historical entries are generated; activity appears only after a supported verified provider event."
        />
      )}
      {!loading && !error && !!rows?.length && (
        <div className="overflow-x-auto rounded-lg border border-border/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Provider reference</th>
                <th className="px-4 py-3">Related records</th>
                <th className="px-4 py-3">Occurred / recorded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((activity) => (
                <tr key={activity.id} className="border-t border-border/10 align-top">
                  <td className="px-4 py-3">
                    <p>{activity.movementType.replace(/_/g, ' ')}</p>
                    <p className="mt-1 text-xs text-muted">{activity.provider}</p>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {activity.currency} {activity.amount}
                  </td>
                  <td className="px-4 py-3">
                    <p className="break-all">{activity.providerObjectReference}</p>
                    <p className="mt-1 break-all text-xs text-muted">
                      {activity.movementIdentifier}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p>Order: {activity.order?.orderNumber ?? 'Not linked'}</p>
                    <p>Payment: {activity.payment?.id ?? 'Not linked'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p>Provider occurrence: {timestamp(activity.occurredAt)}</p>
                    <p className="mt-1">Recorded: {timestamp(activity.recordedAt)}</p>
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
          onChange={(nextPage) => {
            requestId.current += 1;
            setPage(nextPage);
          }}
        />
      )}
    </div>
  );
}
