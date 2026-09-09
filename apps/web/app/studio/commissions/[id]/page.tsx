'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute } from '../../../../components/auth/ProtectedRoute';
import { FormAlert } from '../../../../components/auth/FormAlert';
import { StatusBadge } from '../../../../components/ui/StatusBadge';
import { useAuth } from '../../../../context/AuthContext';
import { marketplaceFetch } from '../../../../lib/marketplaceApi';
import { getCommissionStatusMeta } from '../../../../lib/commissionStatus';

interface CommissionDetail {
  id: string;
  title: string;
  description: string;
  category: string | null;
  style: string | null;
  dimensions: string | null;
  intendedUse: string | null;
  notes: string | null;
  budget: string | null;
  currency: string | null;
  deadline: string | null;
  status: string;
  createdAt: string;
  buyer: { id: string; firstName: string; lastName: string; email: string };
  references: { id: string; url: string; fileName: string | null }[];
  conversation: { id: string } | null;
}

type PendingAction = 'accept' | 'decline' | null;

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

function CommissionDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { firebaseUser } = useAuth();

  const [commission, setCommission] = useState<CommissionDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<PendingAction>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!firebaseUser || !id) return;
    marketplaceFetch(firebaseUser, `/commissions/${id}`)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load commission');
        return response.json();
      })
      .then((result) => setCommission(result.data))
      .catch(() => setLoadError('We could not load this commission. Please refresh.'));
  }, [firebaseUser, id]);

  async function applyStatus(status: 'ACCEPTED' | 'REJECTED') {
    if (!firebaseUser || !commission) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const response = await marketplaceFetch(
        firebaseUser,
        `/commissions/${commission.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        },
      );
      if (!response.ok) throw new Error('That update did not go through. Please try again.');
      const result = await response.json();
      setCommission(result.data);
      setConfirming(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'That update did not go through.');
    } finally {
      setSubmitting(false);
    }
  }

  // "Continue Discussion" navigates into the commission's conversation.
  // Every commission created after this fix already has one (see
  // commissionController.createCommission, which now creates it
  // atomically alongside the commission). We deliberately do NOT fall
  // back to calling POST /messages from here: that endpoint always
  // attributes the caller as the buyer, so an artist calling it would
  // mislabel themselves. A commission with no conversation is a legacy
  // row from before this fix — the button is disabled for those instead.
  function continueDiscussion() {
    if (!commission?.conversation) return;
    router.push(`/messages?conversationId=${commission.conversation.id}` as any);
  }

  if (loadError) {
    return (
      <main className="mx-auto min-h-screen max-w-content px-gutter py-16 sm:py-24">
        <FormAlert message={loadError} />
      </main>
    );
  }

  if (!commission) {
    return (
      <main className="mx-auto min-h-screen max-w-content px-gutter py-16 sm:py-24">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </main>
    );
  }

  const { label, tone } = getCommissionStatusMeta(commission.status);
  // Doc 2 §9: a request may require discussion — don't treat it as a
  // done deal the instant it lands. Accept/Decline are only offered
  // while the commission genuinely still needs a decision.
  const canDecide = commission.status === 'SUBMITTED' || commission.status === 'REVIEWING';

  return (
    <main className="mx-auto min-h-screen max-w-content px-gutter py-16 sm:py-24">
      <Link
        href={'/studio/commissions' as any}
        className="text-sm text-muted hover:text-foreground"
      >
        ← Commissions
      </Link>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl text-foreground">{commission.title}</h1>
        <StatusBadge tone={tone} label={label} />
      </div>
      <p className="mt-2 text-sm text-muted">
        From {commission.buyer.firstName} {commission.buyer.lastName} ·{' '}
        {dateFormatter.format(new Date(commission.createdAt))}
      </p>

      {actionError && (
        <div className="mt-6">
          <FormAlert message={actionError} />
        </div>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <section>
            <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-muted">Brief</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/90">
              commission.description
            </p>
          </section>

          {commission.references.length > 0 && (
            <section>
              <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
                Reference material
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {commission.references.map((reference) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  
                    key={reference.id}
                    src={reference.url}
                    alt={reference.fileName ?? 'Reference image'}
                    className="aspect-square w-full rounded-md object-cover"
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <div className="border border-border/10 p-5 text-sm">
            <dl className="space-y-3">
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-muted">Category</dt>
                <dd className="mt-1 text-foreground">{commission.category ?? 'Not specified'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-muted">Budget</dt>
                <dd className="mt-1 text-foreground">
                  {commission.budget
                    ? `${commission.currency ?? ''} ${commission.budget}`.trim()
                    : 'Not specified'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-muted">Deadline</dt>
                <dd className="mt-1 text-foreground">
                  {commission.deadline
                    ? dateFormatter.format(new Date(commission.deadline))
                    : 'Flexible'}
                </dd>
              </div>
              {commission.notes && (
                <div>
                  <dt className="text-xs uppercase tracking-[0.14em] text-muted">Notes</dt>
                  <dd className="mt-1 text-foreground">{commission.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={continueDiscussion}
              disabled={!commission.conversation}
              title={
                commission.conversation
                  ? undefined
                  : 'Conversation unavailable for this legacy request'
              }
              className="w-full border border-border/20 px-5 py-3 text-sm text-foreground transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue Discussion
            </button>

            {canDecide && (
              <>
                {confirming === null && (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setConfirming('accept')}
                      className="flex-1 bg-accent px-5 py-3 text-sm text-accent-foreground transition hover:opacity-90"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming('decline')}
                      className="flex-1 border border-red-500/30 px-5 py-3 text-sm text-red-600 transition hover:bg-red-500/5"
                    >
                      Decline
                    </button>
                  </div>
                )}

                {confirming === 'accept' && (
                  <div className="space-y-3 border border-accent/30 bg-accent/5 p-4">
                    <p className="text-sm text-foreground">
                      Accept this commission from {commission.buyer.firstName}?
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void applyStatus('ACCEPTED')}
                        className="flex-1 bg-accent px-4 py-2.5 text-sm text-accent-foreground disabled:opacity-50"
                      >
                        {submitting ? 'Accepting…' : 'Yes, accept'}
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => setConfirming(null)}
                        className="flex-1 border border-border/20 px-4 py-2.5 text-sm text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {confirming === 'decline' && (
                  <div className="space-y-3 border border-red-500/30 bg-red-500/5 p-4">
                    <p className="text-sm text-foreground">
                      Decline this commission from {commission.buyer.firstName}? This can&apos;t be
                      undone.
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void applyStatus('REJECTED')}
                        className="flex-1 border border-red-500/30 px-4 py-2.5 text-sm text-red-600 disabled:opacity-50"
                      >
                        {submitting ? 'Declining…' : 'Yes, decline'}
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => setConfirming(null)}
                        className="flex-1 border border-border/20 px-4 py-2.5 text-sm text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

export default function StudioCommissionDetailPage() {
  return (
    <ProtectedRoute allowRoles={['ARTIST']}>
      <CommissionDetailContent />
    </ProtectedRoute>
  );
}
