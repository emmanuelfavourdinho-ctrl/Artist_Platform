'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import {
  confirmOrderReceipt,
  fetchMyOrders,
  fetchOrderDelivery,
  reportOrderDeliveryIssue,
  type OrderDeliveryView,
  type OrderView,
} from '@/lib/ordersApi';

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
  const [delivery, setDelivery] = useState<Record<string, OrderDeliveryView>>({});
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [receiptConfirmed, setReceiptConfirmed] = useState<Record<string, boolean>>({});
  const [issueReason, setIssueReason] = useState<Record<string, 'NOT_RECEIVED' | 'DAMAGED' | 'WRONG_ITEM' | 'OTHER'>>({});
  const [issueDescription, setIssueDescription] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});

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

  const toggleDelivery = async (orderId: string) => {
    if (expandedOrder === orderId) {
      setExpandedOrder(null);
      return;
    }
    setExpandedOrder(orderId);
    if (delivery[orderId]) return;
    try {
      const details = await fetchOrderDelivery(orderId);
      setDelivery((current) => ({ ...current, [orderId]: details }));
    } catch {
      setActionError((current) => ({ ...current, [orderId]: 'We could not load delivery details.' }));
    }
  };

  const reloadDelivery = async (orderId: string) => {
    const details = await fetchOrderDelivery(orderId);
    setDelivery((current) => ({ ...current, [orderId]: details }));
  };

  const confirmReceipt = async (orderId: string) => {
    if (!receiptConfirmed[orderId]) return;
    setActionBusy((current) => ({ ...current, [orderId]: true }));
    setActionError((current) => ({ ...current, [orderId]: '' }));
    try {
      await confirmOrderReceipt(orderId);
      await reloadDelivery(orderId);
      setReceiptConfirmed((current) => ({ ...current, [orderId]: false }));
    } catch {
      setActionError((current) => ({ ...current, [orderId]: 'Receipt could not be confirmed. Please reload and try again.' }));
    } finally {
      setActionBusy((current) => ({ ...current, [orderId]: false }));
    }
  };

  const reportIssue = async (orderId: string) => {
    const description = issueDescription[orderId]?.trim();
    if (!description) return;
    setActionBusy((current) => ({ ...current, [orderId]: true }));
    setActionError((current) => ({ ...current, [orderId]: '' }));
    try {
      await reportOrderDeliveryIssue({
        orderId,
        reason: issueReason[orderId] ?? 'OTHER',
        description,
      });
      await reloadDelivery(orderId);
      setIssueDescription((current) => ({ ...current, [orderId]: '' }));
    } catch {
      setActionError((current) => ({ ...current, [orderId]: 'The delivery issue could not be submitted. Please reload and try again.' }));
    } finally {
      setActionBusy((current) => ({ ...current, [orderId]: false }));
    }
  };

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
          {orders.map((order) => {
            return (
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
              <button
                type="button"
                onClick={() => void toggleDelivery(order.id)}
                className="mt-4 rounded border border-[rgb(var(--border)/0.2)] px-4 py-2 text-sm"
                aria-expanded={expandedOrder === order.id}
              >
                {expandedOrder === order.id ? 'Hide delivery details' : 'View delivery & release status'}
              </button>
              {expandedOrder === order.id && (
                <section className="mt-4 border-t border-[rgb(var(--border)/0.1)] pt-4" aria-label="Delivery details">
                  {actionError[order.id] && <p role="alert" className="mb-3 text-sm text-red-600">{actionError[order.id]}</p>}
                  {!delivery[order.id] ? (
                    <p className="text-sm text-[rgb(var(--muted))]">Loading delivery details…</p>
                  ) : (
                    <>
                      <h3 className="font-medium">Shipment tracking</h3>
                      {delivery[order.id].fulfillments.map((fulfillment, index) => (
                        <div key={`${fulfillment.artistName}-${index}`} className="mt-2 text-sm">
                          <p>{fulfillment.artistName}{fulfillment.carrier ? ` · ${fulfillment.carrier}` : ''}</p>
                          {fulfillment.trackingReference && <p>Tracking: {fulfillment.trackingReference}</p>}
                          {fulfillment.trackingUrl && (
                            <a className="underline" href={fulfillment.trackingUrl} target="_blank" rel="noreferrer">
                              Open carrier tracking
                            </a>
                          )}
                          {fulfillment.shippedAt && <p className="text-[rgb(var(--muted))]">Shipped {new Date(fulfillment.shippedAt).toLocaleString()}</p>}
                        </div>
                      ))}
                      <div className="mt-4">
                        <h3 className="font-medium">Payment release eligibility</h3>
                        <p className="text-sm">
                          {delivery[order.id].releaseStatus === 'ELIGIBLE'
                            ? 'Eligible for release; this is not provider settlement or an artist payout.'
                            : delivery[order.id].releaseStatus === 'BLOCKED'
                              ? 'Release eligibility is blocked by an active hold or delivery dispute.'
                              : 'Not yet eligible for release. Payment confirmation does not mean settlement or payout.'}
                        </p>
                        {delivery[order.id].artistResponseDeadline && !delivery[order.id].buyerReceivedGoodAt ? (
                          <p className="text-xs text-[rgb(var(--muted))]">
                            Artist response deadline: {new Date(delivery[order.id].artistResponseDeadline as string).toLocaleString()}
                          </p>
                        ) : null}
                      </div>
                      {delivery[order.id].buyerReceivedGoodAt ? (
                        <p className="mt-3 text-sm">Receipt confirmed {new Date(delivery[order.id].buyerReceivedGoodAt as string).toLocaleString()}.</p>
                      ) : (
                        <div className="mt-4 space-y-2">
                          <label className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!receiptConfirmed[order.id]}
                              onChange={(event) => setReceiptConfirmed((current) => ({ ...current, [order.id]: event.target.checked }))}
                            />
                            I confirm that I received this order in good condition.
                          </label>
                          <button
                            type="button"
                            disabled={!receiptConfirmed[order.id] || !!actionBusy[order.id]}
                            onClick={() => void confirmReceipt(order.id)}
                            className="rounded bg-[rgb(var(--accent))] px-4 py-2 text-sm text-[rgb(var(--accent-foreground))] disabled:opacity-50"
                          >
                            Confirm receipt
                          </button>
                        </div>
                      )}
                      <div className="mt-5 space-y-2">
                        <h3 className="font-medium">Report a delivery problem</h3>
                        <label className="block text-sm">
                          Issue type
                          <select
                            value={issueReason[order.id] ?? 'OTHER'}
                            onChange={(event) => setIssueReason((current) => ({ ...current, [order.id]: event.target.value as 'NOT_RECEIVED' | 'DAMAGED' | 'WRONG_ITEM' | 'OTHER' }))}
                            className="ml-2 rounded border bg-transparent p-1"
                          >
                            <option value="NOT_RECEIVED">Not received</option>
                            <option value="DAMAGED">Damaged</option>
                            <option value="WRONG_ITEM">Wrong item</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </label>
                        <textarea
                          aria-label="Describe the delivery problem"
                          value={issueDescription[order.id] ?? ''}
                          onChange={(event) => setIssueDescription((current) => ({ ...current, [order.id]: event.target.value }))}
                          maxLength={2000}
                          className="w-full rounded border bg-transparent p-2 text-sm"
                        />
                        <button
                          type="button"
                          disabled={!issueDescription[order.id]?.trim() || !!actionBusy[order.id]}
                          onClick={() => void reportIssue(order.id)}
                          className="rounded border border-[rgb(var(--border)/0.2)] px-4 py-2 text-sm disabled:opacity-50"
                        >
                          Submit delivery issue
                        </button>
                        {delivery[order.id].disputes.map((dispute) => (
                          <p key={dispute.id} className="text-sm">
                            Delivery issue: {dispute.status} · {dispute.reason}
                          </p>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              )}
            </div>
            );
          })}
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
