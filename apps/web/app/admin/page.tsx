'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import {
  EmptyBox,
  ErrorBox,
  PageHeader,
  SkeletonCards,
  StatCard,
} from '../../components/admin/AdminUi';
import { useAdminSession } from '../../components/admin/AdminSessionContext';
import { fetchAdminOverview, type AdminOverview } from '../../lib/adminApi';

// Order states in lifecycle order, so the breakdown reads left-to-right
// the way an order actually progresses. Unknown statuses from the API are
// still shown (appended) rather than dropped.
const ORDER_STATUS_ORDER = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
];

function label(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
}

interface QueueRow {
  title: string;
  count: number;
  href?: string;
  note?: string;
}

function OverviewContent() {
  const { can } = useAdminSession();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    fetchAdminOverview()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load the overview.'),
      );
  }, []);

  useEffect(load, [load]);

  const queues: QueueRow[] = data
    ? [
        {
          title: 'Reviews awaiting moderation',
          count: data.queues.pendingReviews,
          href: '/admin/reviews',
        },
        {
          title: 'Unread contact messages',
          count: data.queues.unreadContactMessages,
          href: '/admin/messages',
        },
        {
          title: 'Artists pending verification',
          count: data.queues.pendingArtistVerification,
          href: can('artists.review') ? '/admin/artist-verification' : undefined,
        },
        {
          title: 'Open reports',
          count: data.queues.openReports,
          href: can('reports.manage') ? '/admin/reports' : undefined,
        },
      ]
    : [];

  const orderStatuses = data
    ? [
        ...ORDER_STATUS_ORDER.filter((s) => s in data.orders.byStatus),
        ...Object.keys(data.orders.byStatus).filter((s) => !ORDER_STATUS_ORDER.includes(s)),
      ]
    : [];

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Workspace"
        title="Overview"
        description="Live counts from the marketplace database and the queues that need a decision."
        action={
          <Link
            href={'/admin/analytics' as Route}
            className="rounded-md border border-border/15 px-4 py-2 text-sm text-foreground/80 transition hover:border-accent hover:text-accent"
          >
            View analytics →
          </Link>
        }
      />

      {error && <ErrorBox message={error} onRetry={load} />}
      {!error && !data && <SkeletonCards count={4} />}

      {data && (
        <>
          <section aria-labelledby="totals-heading">
            <h2 id="totals-heading" className="sr-only">
              Marketplace totals
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Registered users" value={data.users.total} />
              <StatCard label="Artists" value={data.artists.total} />
              <StatCard
                label="Artworks"
                value={data.artworks.total}
                hint={`${data.artworks.published} published`}
              />
              <StatCard label="Orders" value={data.orders.total} hint="All time" />
            </div>
          </section>

          <section aria-labelledby="queues-heading">
            <h2 id="queues-heading" className="font-display text-xl text-foreground">
              Needs attention
            </h2>
            <ul className="mt-4 divide-y divide-border/10 rounded-lg border border-border/10 bg-surface">
              {queues.map((row) => {
                const body = (
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <p className="text-sm text-foreground">{row.title}</p>
                      {row.note && <p className="mt-0.5 text-xs text-muted">{row.note}</p>}
                    </div>
                    <span
                      className={`font-display text-2xl ${
                        row.count > 0 ? 'text-accent' : 'text-muted'
                      }`}
                    >
                      {row.count}
                    </span>
                  </div>
                );
                return (
                  <li key={row.title}>
                    {row.href ? (
                      <Link
                        href={row.href as Route}
                        className="block transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="orders-heading">
            <h2 id="orders-heading" className="font-display text-xl text-foreground">
              Orders by status
            </h2>
            {orderStatuses.length === 0 ? (
              <div className="mt-4">
                <EmptyBox
                  title="No orders yet"
                  description="Order counts will appear here once buyers start checking out."
                />
              </div>
            ) : (
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {orderStatuses.map((status) => (
                  <div
                    key={status}
                    className="rounded-lg border border-border/10 bg-surface px-5 py-4"
                  >
                    <dt className="text-xs uppercase tracking-[0.12em] text-muted">
                      {label(status)}
                    </dt>
                    <dd className="mt-1 font-display text-2xl text-foreground">
                      {data.orders.byStatus[status]}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <p className="text-xs text-muted">
            Recent activity is not shown because the platform does not record an activity feed yet.
          </p>
        </>
      )}
    </div>
  );
}

export default function AdminOverviewPage() {
  return <OverviewContent />;
}
