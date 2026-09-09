'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { useAuth } from '../../../context/AuthContext';
import { marketplaceFetch } from '../../../lib/marketplaceApi';
import { getCommissionStatusMeta } from '../../../lib/commissionStatus';

interface CommissionListItem {
  id: string;
  title: string;
  status: string;
  budget: string | null;
  createdAt: string;
  buyer: { firstName: string; lastName: string };
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

// "Needs your attention" first, then everything else — mirrors the
// information-hierarchy principle from the platform brief: an artist
// opening this page should immediately see what's waiting on them
// (SUBMITTED) before anything already in motion or resolved.
const NEEDS_ATTENTION: string[] = ['SUBMITTED'];

function CommissionsListContent() {
  const { firebaseUser } = useAuth();
  const [commissions, setCommissions] = useState<CommissionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    marketplaceFetch(firebaseUser, '/commissions')
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load commissions');
        return response.json();
      })
      .then((result) => setCommissions(result.data ?? []))
      .catch(() => setError('We could not load your commissions. Please refresh.'));
  }, [firebaseUser]);

  const needsAttention = (commissions ?? []).filter((c) => NEEDS_ATTENTION.includes(c.status));
  const rest = (commissions ?? []).filter((c) => !NEEDS_ATTENTION.includes(c.status));

  return (
    <main className="mx-auto min-h-screen max-w-content px-gutter py-16 sm:py-24">
      <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">Studio</p>
      <h1 className="mt-3 font-display text-5xl text-foreground">Commissions</h1>
      <p className="mt-3 text-sm text-muted">Requests buyers have sent you, in one place.</p>

      {error && (
        <div className="mt-8 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {commissions === null && !error && (
        <div className="mt-12 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      )}

      {commissions !== null && commissions.length === 0 && (
        <div className="mt-12 rounded-lg border border-border/10 p-10 text-center">
          <p className="text-sm text-muted">No commission requests yet.</p>
          <p className="mt-1 text-xs text-muted">
            Requests buyers send from your public profile will show up here.
          </p>
        </div>
      )}

      {needsAttention.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
            Needs your attention
          </h2>
          <div className="mt-4 space-y-3">
            {needsAttention.map((commission) => (
              <CommissionRow key={commission.id} commission={commission} />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
            All commissions
          </h2>
          <div className="mt-4 space-y-3">
            {rest.map((commission) => (
              <CommissionRow key={commission.id} commission={commission} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function CommissionRow({ commission }: { commission: CommissionListItem }) {
  const { label, tone } = getCommissionStatusMeta(commission.status);
  return (
    <Link
      href={`/studio/commissions/${commission.id}` as any}
      className="flex items-center justify-between gap-4 border border-border/10 p-5 transition hover:border-accent/40 hover:bg-surface"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{commission.title}</p>
        <p className="mt-1 text-xs text-muted">
          {commission.buyer.firstName} {commission.buyer.lastName} ·{' '}
          {dateFormatter.format(new Date(commission.createdAt))}
        </p>
      </div>
      <StatusBadge tone={tone} label={label} />
    </Link>
  );
}

export default function StudioCommissionsPage() {
  return (
    <ProtectedRoute allowRoles={['ARTIST']}>
      <CommissionsListContent />
    </ProtectedRoute>
  );
}
