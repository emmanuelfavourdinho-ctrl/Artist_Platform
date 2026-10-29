'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { StudioShell } from '@/components/studio/StudioShell';
import {
  confirmArtistOrderCompletion,
  correctShipmentTracking,
  fetchArtistOrderFulfillments,
  submitShipment,
  type ArtistOrderFulfillmentView,
} from '@/lib/studioOrdersApi';

function ArtistOrdersContent() {
  const [orders, setOrders] = useState<ArtistOrderFulfillmentView[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [forms, setForms] = useState<Record<string, {
    carrier: string;
    trackingReference: string;
    trackingUrl: string;
    reason: string;
  }>>({});

  const load = useCallback(async () => {
    try {
      setOrders(await fetchArtistOrderFulfillments());
      setError('');
    } catch {
      setError('We could not load your order fulfillments.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const values = (order: ArtistOrderFulfillmentView) => forms[order.orderId] ?? {
    carrier: order.carrier ?? '',
    trackingReference: order.trackingReference ?? '',
    trackingUrl: order.trackingUrl ?? '',
    reason: '',
  };
  const update = (orderId: string, key: keyof ReturnType<typeof values>, value: string) => {
    setForms((current) => ({
      ...current,
      [orderId]: { ...values(orders!.find((item) => item.orderId === orderId)!), ...current[orderId], [key]: value },
    }));
  };

  const saveShipment = async (order: ArtistOrderFulfillmentView) => {
    const form = values(order);
    setBusy(order.orderId);
    setError('');
    setFeedback('');
    try {
      if (order.shippedAt) {
        await correctShipmentTracking({
          orderId: order.orderId,
          carrier: form.carrier,
          trackingReference: form.trackingReference,
          ...(form.trackingUrl ? { trackingUrl: form.trackingUrl } : {}),
          reason: form.reason,
        });
      } else {
        await submitShipment({
          orderId: order.orderId,
          carrier: form.carrier,
          trackingReference: form.trackingReference,
          ...(form.trackingUrl ? { trackingUrl: form.trackingUrl } : {}),
        });
      }
      await load();
      setFeedback(order.shippedAt ? 'Tracking correction saved and recorded.' : 'Shipment details saved for the buyer.');
    } catch {
      setError('Shipment information could not be saved. Please reload and try again.');
    } finally {
      setBusy(null);
    }
  };

  const confirmCompletion = async (orderId: string) => {
    setBusy(orderId);
    setError('');
    setFeedback('');
    try {
      await confirmArtistOrderCompletion(orderId);
      await load();
      setFeedback('Your fulfillment completion was recorded. The buyer still needs to confirm receipt.');
    } catch {
      setError('Completion could not be confirmed. Please reload and try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <StudioShell>
      <header className="mb-8 border-b border-border/10 pb-6">
        <p className="text-xs uppercase tracking-[.18em] text-accent">Orders & delivery</p>
        <h1 className="mt-2 font-display text-4xl">Your orders</h1>
        <p className="mt-2 text-sm text-[rgb(var(--muted))]">
          Confirming completion does not authorize payment release or indicate that a payout was sent.
        </p>
      </header>
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {feedback && <p role="status" className="mb-4 text-sm text-emerald-400">{feedback}</p>}
      {orders === null ? (
        <p aria-busy="true">Loading orders…</p>
      ) : orders.length === 0 ? (
        <p className="rounded bg-[rgb(var(--surface))] p-6">No order fulfillments are available.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const form = values(order);
            return (
              <section key={order.orderId} className="space-y-4 rounded border border-[rgb(var(--border)/0.1)] bg-[rgb(var(--surface))] p-6">
                <div className="flex flex-wrap justify-between gap-2">
                  <h2 className="font-mono">{order.order.orderNumber}</h2>
                  <span>{order.order.status}</span>
                </div>
                <ul className="divide-y divide-border/10 border-y border-border/10">
                  {order.order.items.map((item) => (
                    <li key={item.id} className="py-2 text-sm">
                      {item.title} · Qty {item.quantity} · {item.currency} {item.price}
                    </li>
                  ))}
                </ul>
                <p className="text-sm">
                  Payment release eligibility: {order.order.releaseStatus}. Eligibility is not settlement or payout.
                </p>
                {order.order.artistResponseDeadline && (
                  <p className="text-sm">Buyer confirmation response deadline: {new Date(order.order.artistResponseDeadline).toLocaleString()}</p>
                )}
                {order.order.buyerReceivedGoodAt && (
                  <p className="text-sm">Buyer confirmed receipt: {new Date(order.order.buyerReceivedGoodAt).toLocaleString()}</p>
                )}
                {order.order.deliveryDisputes.filter((dispute) => dispute.status === 'OPEN').map((dispute) => (
                  <div key={dispute.id} className="border-l-2 border-amber-500 px-4 py-2 text-sm">
                    <p className="font-medium">Open delivery issue · {dispute.reason.replaceAll('_', ' ')}</p>
                    <p className="mt-1 text-muted">{dispute.description}</p>
                    <Link href="/studio/support" className="mt-2 inline-block text-accent underline">View issue and response options</Link>
                  </div>
                ))}
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm">Carrier
                    <input required value={form.carrier} onChange={(event) => update(order.orderId, 'carrier', event.target.value)} className="mt-1 w-full rounded border bg-transparent p-2" />
                  </label>
                  <label className="text-sm">Tracking reference
                    <input required value={form.trackingReference} onChange={(event) => update(order.orderId, 'trackingReference', event.target.value)} className="mt-1 w-full rounded border bg-transparent p-2" />
                  </label>
                  <label className="text-sm md:col-span-2">Tracking URL (HTTPS)
                    <input type="url" value={form.trackingUrl} onChange={(event) => update(order.orderId, 'trackingUrl', event.target.value)} className="mt-1 w-full rounded border bg-transparent p-2" />
                  </label>
                  {order.shippedAt && (
                    <label className="text-sm md:col-span-2">Reason for tracking correction
                      <input required minLength={10} value={form.reason} onChange={(event) => update(order.orderId, 'reason', event.target.value)} className="mt-1 w-full rounded border bg-transparent p-2" />
                    </label>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy === order.orderId || !form.carrier.trim() || !form.trackingReference.trim() || (order.shippedAt !== null && form.reason.trim().length < 10)}
                    onClick={() => void saveShipment(order)}
                    className="rounded bg-[rgb(var(--accent))] px-4 py-2 text-sm text-[rgb(var(--accent-foreground))] disabled:opacity-50"
                  >
                    {order.shippedAt ? 'Save audited tracking correction' : 'Mark shipped'}
                  </button>
                  {order.shippedAt && !order.artistCompletionConfirmedAt && (
                    <button
                      type="button"
                      disabled={busy === order.orderId}
                      onClick={() => void confirmCompletion(order.orderId)}
                      className="rounded border border-[rgb(var(--border)/0.2)] px-4 py-2 text-sm disabled:opacity-50"
                    >
                      Confirm my completion
                    </button>
                  )}
                  {order.shippedAt && <span className="self-center text-xs text-[rgb(var(--muted))]">Shipped {new Date(order.shippedAt).toLocaleString()}</span>}
                  {order.artistCompletionConfirmedAt && <span className="self-center text-xs text-[rgb(var(--muted))]">Completion confirmed {new Date(order.artistCompletionConfirmedAt).toLocaleString()}</span>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </StudioShell>
  );
}

export default function ArtistOrdersPage() {
  return <ProtectedRoute><ArtistOrdersContent /></ProtectedRoute>;
}
