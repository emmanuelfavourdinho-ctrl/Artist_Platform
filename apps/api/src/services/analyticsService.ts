import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ANALYTICS_RANGES, type AnalyticsRangeKey } from '../validation/analytics.js';

/*
  Explainer: every number here is derived from a specific event, and the
  name of each metric says which one. The previous implementation summed
  Order.totalAmount for DELIVERED orders and called it "revenue", which
  is wrong on three counts:
    1. Money is received when the Stripe webhook records a SUCCEEDED
       Payment (paidAt), not when an order is later marked DELIVERED.
    2. It added amounts across currencies (a 100 USD order + a 100 XAF
       order is not 200 of anything).
    3. Order.totalAmount is the buyer's total (including shipping/tax),
       which is not the platform's income. The platform's income is the
       commission, stored per item in OrderItem.commissionAmount.

  Refunds: nothing in this codebase writes REFUNDED/PARTIALLY_REFUNDED
  yet (the Stripe webhook only handles checkout completion), and no
  refunded AMOUNT is stored anywhere. So refund counts are reported by
  status, and `refundAmountsTracked: false` is returned so the UI can say
  so honestly instead of showing a made-up 0.
*/

// An order counts as "placed and paid for" once it has moved past
// PENDING. CANCELLED and the refund states are excluded from gross order
// value and shown separately through the status breakdown.
const PAID_ORDER_STATUSES = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AnalyticsWindow {
  key: AnalyticsRangeKey;
  days: number;
  from: Date;
  to: Date;
}

export function resolveWindow(key: AnalyticsRangeKey, now: Date = new Date()): AnalyticsWindow {
  const days = ANALYTICS_RANGES[key];
  return { key, days, from: new Date(now.getTime() - days * DAY_MS), to: now };
}

function money(value: Prisma.Decimal | number | string | null | undefined): number {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

// "This order has at least one successful payment inside the window" —
// `some` (not a join) so an order that was paid twice is still counted
// once, which is what prevents double-counting items or commission.
function paidInWindow(window: AnalyticsWindow): Prisma.OrderItemWhereInput {
  return {
    order: {
      payments: {
        some: { status: 'SUCCEEDED', paidAt: { gte: window.from, lt: window.to } },
      },
    },
  };
}

export async function getOrderMetrics(window: AnalyticsWindow) {
  const [byStatus, placedInWindow] = await Promise.all([
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.order.groupBy({
      by: ['currency'],
      where: {
        status: { in: [...PAID_ORDER_STATUSES] },
        createdAt: { gte: window.from, lt: window.to },
      },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
  ]);

  return {
    // All-time snapshot of where orders currently are.
    byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
    // Orders created in the window and past PENDING, per currency.
    grossOrderValueByCurrency: placedInWindow.map((row) => ({
      currency: row.currency,
      orders: row._count._all,
      total: money(row._sum.totalAmount),
    })),
  };
}

export async function getPaymentMetrics(window: AnalyticsWindow) {
  const [succeeded, byStatus] = await Promise.all([
    prisma.payment.groupBy({
      by: ['currency'],
      where: { status: 'SUCCEEDED', paidAt: { gte: window.from, lt: window.to } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  return {
    succeededByCurrency: succeeded.map((row) => ({
      currency: row.currency,
      payments: row._count._all,
      total: money(row._sum.amount),
    })),
    byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
    refundAmountsTracked: false,
  };
}

export async function getCommissionMetrics(window: AnalyticsWindow) {
  const rows = await prisma.orderItem.groupBy({
    by: ['currency'],
    where: paidInWindow(window),
    _sum: { subtotal: true, commissionAmount: true },
    _count: { _all: true },
  });

  return rows.map((row) => ({
    currency: row.currency,
    orderItems: row._count._all,
    grossItemSales: money(row._sum.subtotal),
    // Calculated at checkout from the commission rate in force at the
    // time. NOT net of refunds (see note at the top of this file).
    platformCommission: money(row._sum.commissionAmount),
  }));
}

interface DailyRow {
  day: Date | string;
  currency: string;
  payments: number | bigint;
  total: Prisma.Decimal | number | string | null;
}

export async function getPaymentTimeSeries(window: AnalyticsWindow) {
  // Aggregated in PostgreSQL rather than fetching every payment row into
  // Node and bucketing there — row count grows with the marketplace, the
  // result here is at most (days x currencies) rows.
  const rows = await prisma.$queryRaw<DailyRow[]>(Prisma.sql`
    SELECT
      date_trunc('day', "paidAt" AT TIME ZONE 'UTC')::date AS day,
      "currency" AS currency,
      COUNT(*)::int AS payments,
      SUM("amount") AS total
    FROM "Payment"
    WHERE "status" = 'SUCCEEDED'
      AND "paidAt" IS NOT NULL
      AND "paidAt" >= ${window.from}
      AND "paidAt" < ${window.to}
    GROUP BY 1, 2
    ORDER BY 1 ASC, 2 ASC
  `);

  return rows.map((row) => ({
    date: new Date(row.day).toISOString().slice(0, 10),
    currency: row.currency,
    payments: Number(row.payments),
    total: money(row.total),
  }));
}

export async function getTopArtworks(window: AnalyticsWindow, limit: number) {
  const grouped = await prisma.orderItem.groupBy({
    by: ['artworkId', 'currency'],
    // OrderItem.artworkId is nullable (SetNull when an artwork is
    // deleted) — those rows have nothing to attribute sales to.
    where: { artworkId: { not: null }, ...paidInWindow(window) },
    _sum: { quantity: true, subtotal: true },
    _count: { _all: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: limit,
  });

  const ids = grouped.map((row) => row.artworkId).filter((id): id is string => id !== null);
  const artworks = ids.length
    ? await prisma.artwork.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          title: true,
          slug: true,
          images: { where: { isPrimary: true }, take: 1, select: { url: true } },
        },
      })
    : [];
  const byId = new Map(artworks.map((artwork) => [artwork.id, artwork]));

  return grouped.map((row) => {
    const artwork = row.artworkId ? byId.get(row.artworkId) : undefined;
    return {
      artworkId: row.artworkId,
      title: artwork?.title ?? null,
      slug: artwork?.slug ?? null,
      imageUrl: artwork?.images[0]?.url ?? null,
      unitsSold: row._sum.quantity ?? 0,
      orderItems: row._count._all,
      currency: row.currency,
      salesValue: money(row._sum.subtotal),
    };
  });
}

export async function getAnalyticsDashboard(key: AnalyticsRangeKey, limit: number, now?: Date) {
  const window = resolveWindow(key, now);

  const [orders, payments, commission, timeSeries, topArtworks] = await Promise.all([
    getOrderMetrics(window),
    getPaymentMetrics(window),
    getCommissionMetrics(window),
    getPaymentTimeSeries(window),
    getTopArtworks(window, limit),
  ]);

  return {
    range: {
      key: window.key,
      days: window.days,
      from: window.from.toISOString(),
      to: window.to.toISOString(),
    },
    orders,
    payments,
    commission,
    timeSeries,
    topArtworks,
    // Shipped with the data so the UI never has to guess what a number means.
    definitions: {
      payments: 'Successful payments received (Payment.paidAt) inside the range, per currency.',
      grossOrderValue:
        'Order totals (incl. shipping/tax) for orders created in the range that are past PENDING and not cancelled/refunded, per currency.',
      platformCommission:
        'Sum of OrderItem.commissionAmount for orders with a successful payment in the range, per currency. Not net of refunds.',
      topArtworks: 'Ranked by units sold, for orders with a successful payment in the range.',
    },
  };
}
