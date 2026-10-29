'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { StudioShell } from '../../components/studio/StudioShell';
import { VerificationTaskBanner } from '../../components/studio/VerificationTaskBanner';
import { fetchStudioArtworks, fetchStudioDisputes, type StudioArtwork, type StudioDispute } from '../../lib/studioApi';
import { fetchArtistOrderFulfillments, type ArtistOrderFulfillmentView } from '../../lib/studioOrdersApi';

function OverviewContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<ArtistOrderFulfillmentView[]>([]);
  const [disputes, setDisputes] = useState<StudioDispute[]>([]);
  const [artworks, setArtworks] = useState<StudioArtwork[]>([]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [orderData, disputeData, artworkData] = await Promise.all([
        fetchArtistOrderFulfillments(),
        fetchStudioDisputes(),
        fetchStudioArtworks(),
      ]);
      setOrders(orderData);
      setDisputes(disputeData);
      setArtworks(artworkData.artworks);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your studio overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shipmentTasks = orders.filter((order) =>
    !order.shippedAt && ['CONFIRMED', 'PROCESSING'].includes(order.order.status),
  );
  const disputeTasks = disputes.filter((dispute) =>
    dispute.status === 'OPEN' && !dispute.artistRespondedAt,
  );
  const rejected = artworks.filter((artwork) => artwork.status === 'REJECTED');
  const taskCount = shipmentTasks.length + disputeTasks.length + rejected.length;

  return (
    <StudioShell>
      <div className="space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.18em] text-accent">Artist workspace</p>
            <h1 className="mt-2 font-display text-4xl sm:text-5xl">Overview</h1>
            <p className="mt-3 max-w-2xl text-sm text-muted">A clear view of what needs attention and what to do next.</p>
          </div>
          <Link href="/studio/artworks" className="min-h-11 rounded-md bg-accent px-5 py-3 text-sm font-medium text-background">Create artwork</Link>
        </header>

        <VerificationTaskBanner />

        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-red-400 bg-surface px-4 py-3 text-sm">
            <span>{error}</span>
            <button type="button" onClick={() => void load()} className="underline">Try again</button>
          </div>
        )}

        <section aria-labelledby="attention-heading">
          <div className="mb-4 flex items-end justify-between gap-4 border-b border-border/10 pb-3">
            <div>
              <p className="text-xs uppercase tracking-[.16em] text-muted">Your next steps</p>
              <h2 id="attention-heading" className="mt-1 font-display text-2xl">Needs your attention</h2>
            </div>
            {!loading && taskCount > 0 && <span className="text-sm text-accent">{taskCount} open {taskCount === 1 ? 'task' : 'tasks'}</span>}
          </div>

          {loading ? (
            <div role="status" aria-label="Loading attention items" className="h-32 animate-pulse rounded-lg bg-surface" />
          ) : taskCount === 0 ? (
            <div className="rounded-lg border border-border/10 bg-surface px-5 py-8">
              <h3 className="font-display text-xl">You’re all caught up</h3>
              <p className="mt-2 text-sm text-muted">No shipment, dispute or listing corrections need your attention right now.</p>
              <Link href="/studio/artworks" className="mt-4 inline-block text-sm text-accent underline">Manage your artworks</Link>
            </div>
          ) : (
            <ul className="divide-y divide-border/10 border-y border-border/10">
              {shipmentTasks.map((order) => (
                <li key={`shipment-${order.orderId}`} className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-accent">Shipment needed · {order.order.orderNumber}</p>
                    <h3 className="mt-1 font-display text-lg">Prepare and record shipment</h3>
                    <p className="mt-1 text-sm text-muted">{order.order.items.map((item) => item.title).join(', ')} · Order status: {order.order.status}</p>
                    <p className="mt-1 text-xs text-muted">After saving carrier and tracking details, the buyer can follow the shipment. Tracking does not confirm delivery or payout.</p>
                  </div>
                  <Link href="/studio/orders" className="inline-flex min-h-11 items-center justify-center rounded-md border border-accent/50 px-4 text-sm text-accent">Open orders</Link>
                </li>
              ))}
              {disputeTasks.map((dispute) => (
                <li key={`dispute-${dispute.id}`} className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-accent">Dispute response needed · {dispute.order.orderNumber}</p>
                    <h3 className="mt-1 font-display text-lg">{dispute.reason.replaceAll('_', ' ')}</h3>
                    <p className="mt-1 text-sm text-muted">{dispute.order.items.map((item) => item.title).join(', ')} · {dispute.description}</p>
                    {dispute.order.artistResponseDeadline && <p className="mt-1 text-xs text-muted">Artist response deadline: {new Date(dispute.order.artistResponseDeadline).toLocaleString()}</p>}
                    <p className="mt-1 text-xs text-muted">Your response is recorded for review; it does not close the dispute or unblock release.</p>
                  </div>
                  <Link href="/studio/support" className="inline-flex min-h-11 items-center justify-center rounded-md border border-accent/50 px-4 text-sm text-accent">Respond to issue</Link>
                </li>
              ))}
              {rejected.map((artwork) => (
                <li key={`artwork-${artwork.id}`} className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-accent">Listing returned · {artwork.title}</p>
                    <h3 className="mt-1 font-display text-lg">Correct and resubmit this artwork</h3>
                    <p className="mt-1 text-sm text-muted">{artwork.moderationHistory[0]?.reason ?? 'Review the artwork details and submit it again for moderation.'}</p>
                  </div>
                  <Link href="/studio/artworks" className="inline-flex min-h-11 items-center justify-center rounded-md border border-accent/50 px-4 text-sm text-accent">Review artwork</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </StudioShell>
  );
}

export default function StudioPage() {
  return <ProtectedRoute allowRoles={['ARTIST']}><OverviewContent /></ProtectedRoute>;
}
