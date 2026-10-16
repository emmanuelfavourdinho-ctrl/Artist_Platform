'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EmptyBox,
  ErrorBox,
  PageHeader,
  SkeletonCards,
  StatCard,
  formatMoney,
} from '../../../components/admin/AdminUi';
import {
  fetchAnalyticsDashboard,
  type AnalyticsDashboard,
  type AnalyticsRange,
  type DailyPoint,
} from '../../../lib/adminApi';

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '365d', label: '12 months' },
];

function DailyBars({ currency, points }: { currency: string; points: DailyPoint[] }) {
  // Scaled per currency on purpose: bars in different currencies are not
  // comparable, so each currency gets its own chart and its own maximum.
  const max = Math.max(...points.map((p) => p.total), 1);
  return (
    <div className="rounded-lg border border-border/10 bg-surface p-5">
      <h3 className="text-xs uppercase tracking-[0.14em] text-muted">
        Payments received per day · {currency}
      </h3>
      <ul className="mt-4 space-y-2">
        {points.map((point) => (
          <li key={point.date} className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 text-xs">
            <span className="text-muted">{point.date}</span>
            <div className="h-2 rounded-full bg-foreground/5">
              <div
                className="h-2 rounded-full bg-accent"
                style={{ width: `${Math.max(2, (point.total / max) * 100)}%` }}
              />
            </div>
            <span className="text-foreground">
              {formatMoney(point.total, currency)}
              <span className="ml-2 text-muted">
                ({point.payments} payment{point.payments === 1 ? '' : 's'})
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnalyticsContent() {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    fetchAnalyticsDashboard(range)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load analytics.'),
      );
  }, [range]);

  useEffect(load, [load]);

  const seriesByCurrency = useMemo(() => {
    const grouped = new Map<string, DailyPoint[]>();
    for (const point of data?.timeSeries ?? []) {
      grouped.set(point.currency, [...(grouped.get(point.currency) ?? []), point]);
    }
    return [...grouped.entries()];
  }, [data]);

  const hasMoney =
    !!data &&
    (data.payments.succeededByCurrency.length > 0 ||
      data.orders.grossOrderValueByCurrency.length > 0 ||
      data.commission.length > 0);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Workspace"
        title="Analytics"
        description="Money figures are shown per currency and are never added across currencies."
        action={
          <div role="group" aria-label="Time range" className="flex flex-wrap gap-2">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                aria-pressed={range === r.value}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  range === r.value
                    ? 'border-accent text-accent'
                    : 'border-border/15 text-muted hover:border-foreground/30 hover:text-foreground'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {error && <ErrorBox message={error} onRetry={load} />}
      {!error && !data && <SkeletonCards count={3} />}

      {data && !hasMoney && (
        <EmptyBox
          title="No transaction activity in this period"
          description="Analytics will appear here as marketplace activity begins."
        />
      )}

      {data && hasMoney && (
        <>
          <section aria-labelledby="money-heading" className="space-y-6">
            <h2 id="money-heading" className="sr-only">
              Money
            </h2>

            <div>
              <h3 className="text-xs uppercase tracking-[0.14em] text-muted">Payments received</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.payments.succeededByCurrency.map((row) => (
                  <StatCard
                    key={row.currency}
                    label={row.currency}
                    value={formatMoney(row.total, row.currency)}
                    hint={`${row.payments} successful payment${row.payments === 1 ? '' : 's'}`}
                  />
                ))}
                {data.payments.succeededByCurrency.length === 0 && (
                  <EmptyBox title="No successful payments in this period" />
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-[0.14em] text-muted">Platform commission</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.commission.map((row) => (
                  <StatCard
                    key={row.currency}
                    label={row.currency}
                    value={formatMoney(row.platformCommission, row.currency)}
                    hint={`of ${formatMoney(row.grossItemSales, row.currency)} item sales`}
                  />
                ))}
                {data.commission.length === 0 && (
                  <EmptyBox title="No commission earned in this period" />
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-[0.14em] text-muted">Gross order value</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.orders.grossOrderValueByCurrency.map((row) => (
                  <StatCard
                    key={row.currency}
                    label={row.currency}
                    value={formatMoney(row.total, row.currency)}
                    hint={`${row.orders} order${row.orders === 1 ? '' : 's'} placed`}
                  />
                ))}
                {data.orders.grossOrderValueByCurrency.length === 0 && (
                  <EmptyBox title="No paid orders placed in this period" />
                )}
              </div>
            </div>

            <ul className="space-y-1 text-xs text-muted">
              <li>
                <strong className="font-medium text-foreground/80">Payments:</strong>{' '}
                {data.definitions.payments}
              </li>
              <li>
                <strong className="font-medium text-foreground/80">Commission:</strong>{' '}
                {data.definitions.platformCommission}
              </li>
              <li>
                <strong className="font-medium text-foreground/80">Gross order value:</strong>{' '}
                {data.definitions.grossOrderValue}
              </li>
              {!data.payments.refundAmountsTracked && (
                <li>
                  Refund amounts are not recorded by the platform yet, so the figures above are not
                  net of refunds.
                </li>
              )}
            </ul>
          </section>

          {seriesByCurrency.length > 0 && (
            <section aria-labelledby="trend-heading" className="space-y-4">
              <h2 id="trend-heading" className="font-display text-xl text-foreground">
                Daily payments
              </h2>
              {seriesByCurrency.map(([currency, points]) => (
                <DailyBars key={currency} currency={currency} points={points} />
              ))}
            </section>
          )}

          <section aria-labelledby="top-heading">
            <h2 id="top-heading" className="font-display text-xl text-foreground">
              Top artworks
            </h2>
            {data.topArtworks.length === 0 ? (
              <div className="mt-4">
                <EmptyBox title="No artwork sales in this period" />
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-lg border border-border/10 bg-surface">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead className="border-b border-border/10 text-xs uppercase tracking-[0.12em] text-muted">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Artwork</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Units sold</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Order items</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Sales value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/10">
                    {data.topArtworks.map((art) => (
                      <tr key={`${art.artworkId}-${art.currency}`}>
                        <td className="px-4 py-3 text-foreground">{art.title ?? 'Unavailable artwork'}</td>
                        <td className="px-4 py-3 text-right">{art.unitsSold}</td>
                        <td className="px-4 py-3 text-right">{art.orderItems}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(art.salesValue, art.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-muted">{data.definitions.topArtworks}</p>
          </section>
        </>
      )}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  return <AnalyticsContent />;
}
