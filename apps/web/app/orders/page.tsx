'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { fetchMyOrders, type OrderView } from '@/lib/ordersApi';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
};

function OrdersContent() {
  const [orders, setOrders] = useState<OrderView[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMyOrders()
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--foreground))] px-[var(--container-gutter)] py-12">
      <header className="mb-12 border-b border-[rgb(var(--border)/0.12)] pb-8">
        <span className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--accent))] font-medium">
          Order History
        </span>
        <h1 className="font-['Fraunces'] text-4xl md:text-6xl font-normal mt-2 tracking-tight">
          Your Orders
        </h1>
      </header>

      {failed && (
        <div className="text-center py-24">
          <p className="text-[rgb(var(--muted))]">We couldn&apos;t load your orders right now.</p>
        </div>
      )}

      {!failed && orders === null && (
        <div className="space-y-4" aria-busy="true">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[rgb(var(--surface))]"
            />
          ))}
        </div>
      )}

      {!failed && orders !== null && orders.length === 0 && (
        <div className="text-center py-24 bg-[rgb(var(--surface))] rounded-[var(--radius-lg)] border border-[rgb(var(--border)/0.05)]">
          <p className="font-['Fraunces'] text-xl text-[rgb(var(--muted))]">
            You haven&apos;t placed any orders yet.
          </p>
          <Link
            href="/gallery"
            className="inline-block mt-6 px-6 py-2.5 bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] font-medium text-sm rounded-[var(--radius-sm)]"
          >
            Explore Gallery
          </Link>
        </div>
      )}

      {!failed && orders !== null && orders.length > 0 && (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="p-6 bg-[rgb(var(--surface))] rounded-[var(--radius-md)] border border-[rgb(var(--border)/0.06)]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-sm text-[rgb(var(--muted))]">
                  {order.orderNumber}
                </span>
                <span className="text-xs uppercase tracking-wide text-[rgb(var(--accent))]">
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>
              <p className="text-xs text-[rgb(var(--muted))] mt-1">
                {new Date(order.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>

              <ul className="mt-4 space-y-2">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between text-sm">
                    <span>
                      {item.titleSnapshot}{' '}
                      <span className="text-[rgb(var(--muted))]">by {item.artistNameSnapshot}</span>
                    </span>
                    <span className="font-mono">
                      {item.currency} {Number(item.subtotal).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 border-t border-[rgb(var(--border)/0.1)] pt-4 flex justify-between font-semibold">
                <span>Total</span>
                <span className="font-mono">
                  {order.currency} {Number(order.totalAmount).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <ProtectedRoute>
      <OrdersContent />
    </ProtectedRoute>
  );
}
