'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { StudioShell } from '../../../components/studio/StudioShell';
import { fetchStudioEarnings, type StudioEarnings } from '../../../lib/studioApi';

function amount(value: string, currency: string) {
  const exponent = ['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'].includes(currency.toUpperCase()) ? 0 : 2;
  const minor = BigInt(value);
  if (exponent === 0) return `${currency} ${minor.toLocaleString()}`;
  const scale = BigInt(10) ** BigInt(exponent);
  return `${currency} ${(minor / scale).toLocaleString()}.${String(minor % scale).padStart(exponent, '0')}`;
}

function EarningsContent() {
  const [data, setData] = useState<StudioEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      setData(await fetchStudioEarnings());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load artist financial records.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <StudioShell>
      <header className="border-b border-border/10 pb-6">
        <p className="text-xs uppercase tracking-[.18em] text-accent">Artist finance</p>
        <h1 className="mt-2 font-display text-4xl">Earnings</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">Only records linked to your artist account are shown. There are no inferred historical payouts or cross-currency totals.</p>
      </header>
      <div className="mt-5 border-l-2 border-accent px-4 py-3 text-sm">
        <p className="font-medium">These financial states are different</p>
        <p className="mt-1 text-muted">Buyer payment confirmation is not provider settlement. Release eligibility is not a payout. A payout is complete only after provider-confirmed success appears in the activity register.</p>
      </div>
      {data && !data.providerConfigured && (
        <p className="mt-4 text-sm text-amber-200">A production refund or payout provider is not configured. No live payout can be submitted from this workspace.</p>
      )}
      {error && <div role="alert" className="mt-5 flex justify-between gap-3 text-sm text-red-300"><span>{error}</span><button type="button" onClick={() => void load()} className="underline">Try again</button></div>}
      {loading ? (
        <div role="status" aria-label="Loading earnings" className="mt-6 h-40 animate-pulse rounded-lg bg-surface" />
      ) : data && (
        <div className="mt-8 space-y-10">
          <section aria-labelledby="payouts-title">
            <h2 id="payouts-title" className="font-display text-2xl">Payout operations</h2>
            {data.payouts.length === 0 ? (
              <p className="mt-3 border-y border-border/10 py-6 text-sm text-muted">No payout operations are recorded for your artist account. Release eligibility alone does not create a payout record.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border/10 border-y border-border/10">
                {data.payouts.map((payout) => (
                  <li key={payout.id} className="py-5">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <h3 className="font-display text-lg">{payout.order.orderNumber}</h3>
                        <p className="mt-1 text-xs text-muted">Release eligibility: {payout.order.releaseStatus}{payout.order.releaseEligibleAt ? ` · ${new Date(payout.order.releaseEligibleAt).toLocaleString()}` : ''}</p>
                      </div>
                      <div className="text-right"><p className="font-mono">{amount(payout.amountMinorUnits, payout.currency)}</p><p className="mt-1 text-xs text-muted">Payout status: {payout.status}</p></div>
                    </div>
                    <p className="mt-2 text-xs text-muted">Stored commission snapshot: {amount(payout.commissionMinorUnits, payout.currency)}. Provider fees are not inferred or deducted.</p>
                    {payout.providerReference && <p className="mt-1 break-all text-xs text-muted">Provider reference: {payout.providerReference}</p>}
                    <ol className="mt-3 space-y-1 border-l border-border/20 pl-3 text-xs text-muted">
                      {payout.events.map((event, index) => <li key={`${event.eventType}-${event.occurredAt}-${index}`}>{new Date(event.occurredAt).toLocaleString()} · {event.fromStatus ? `${event.fromStatus} → ` : ''}{event.toStatus}</li>)}
                    </ol>
                    {payout.status === 'SUCCEEDED' && !data.confirmedActivities.some((activity) => activity.movementType === 'ARTIST_PAYOUT_CONFIRMED' && activity.providerObjectReference === payout.providerReference) && (
                      <p className="mt-2 text-xs text-amber-200">Provider success is recorded on the operation; no matching payout activity entry is available in this response.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="activity-title">
            <h2 id="activity-title" className="font-display text-2xl">Provider-confirmed payout activity</h2>
            {data.confirmedActivities.length === 0 ? (
              <p className="mt-3 border-y border-border/10 py-6 text-sm text-muted">No provider-confirmed payout movements are recorded for your account.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border/10 border-y border-border/10">
                {data.confirmedActivities.map((activity) => (
                  <li key={activity.id} className="flex flex-wrap justify-between gap-2 py-4 text-sm">
                    <div><p>{activity.order?.orderNumber ?? activity.movementType}</p><p className="mt-1 text-xs text-muted">{activity.provider} · {activity.providerObjectReference}</p><p className="mt-1 text-xs text-muted">Recorded {new Date(activity.recordedAt).toLocaleString()}{activity.occurredAt ? ` · Provider time ${new Date(activity.occurredAt).toLocaleString()}` : ''}</p></div>
                    <p className="font-mono">{amount(activity.amountMinorUnits, activity.currency)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </StudioShell>
  );
}

export default function StudioEarningsPage() {
  return <ProtectedRoute allowRoles={['ARTIST']}><EarningsContent /></ProtectedRoute>;
}
