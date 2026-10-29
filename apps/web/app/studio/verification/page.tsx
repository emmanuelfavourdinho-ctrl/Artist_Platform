'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { fetchOwnVerification, type ArtistRequest, type OwnVerification } from '../../../lib/verificationApi';
import { REQUEST_STATUS } from '../../../lib/verificationStatus';

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function statusCopy(data: OwnVerification) {
  if (data.verificationStatus === 'PENDING') {
    if (data.activeRequest?.status === 'AWAITING_ARTIST_INPUT') {
      return { title: 'Action needed', body: 'Our team needs more information before it can complete your review.' };
    }
    if (data.activeRequest?.status === 'AWAITING_REVIEW') {
      return { title: 'Pending review', body: 'Your response has been submitted. Our team will review it and notify you of the outcome.' };
    }
    if (data.history.length === 0) {
      return { title: 'Not submitted', body: 'Your verification review has not started. Contact support if you expected a review request.' };
    }
    return { title: 'Pending — no active request', body: 'There is no open information request. Contact support if you need help with the next step.' };
  }
  if (data.verificationStatus === 'VERIFIED') {
    return { title: 'Approved · verified', body: 'Your profile is verified. You can sell artwork and receive commission requests.' };
  }
  if (data.verificationStatus === 'REJECTED') {
    return { title: 'Rejected · not approved', body: 'Your verification was not approved. Resubmission is not currently available; contact support if you have questions.' };
  }
  return { title: 'Suspended', body: 'Your verification is currently suspended. Contact support for details.' };
}

function Row({ request }: { request: ArtistRequest }) {
  return (
    <li>
      <Link
        href={`/studio/verification/${request.id}` as Route}
        className="flex items-center justify-between gap-4 rounded-lg border border-border/10 bg-surface px-5 py-4 text-sm transition hover:border-accent/40"
      >
        <span className="text-foreground">Request {request.round}</span>
        <span className="text-xs text-muted">
          {REQUEST_STATUS[request.status].artist} · {dateTime.format(new Date(request.createdAt))}
        </span>
      </Link>
    </li>
  );
}

function Content() {
  const [data, setData] = useState<OwnVerification | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchOwnVerification()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your verification.'));
  }, []);
  useEffect(load, [load]);

  const copy = data ? statusCopy(data) : null;

  return (
    <main className="mx-auto min-h-screen max-w-content px-gutter py-16 sm:py-24">
      <Link href={'/studio' as Route} className="text-sm text-muted hover:text-foreground">← Studio</Link>
      <h1 className="mt-4 font-display text-4xl text-foreground">Verification</h1>

      {error && (
        <div role="alert" className="mt-8 rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          <p>{error}</p>
          <button type="button" onClick={load} className="mt-3 rounded-md border border-red-500/40 px-3 py-1.5 text-xs">Try again</button>
        </div>
      )}
      {!error && !data && <div className="mt-8 h-32 animate-pulse rounded-lg bg-surface" role="status" aria-label="Loading" />}

      {data && (
        <div className="mt-8 space-y-10">
          <section aria-labelledby="status" className="rounded-lg border border-border/10 bg-surface p-5">
            <h2 id="status" className="text-xs uppercase tracking-[0.14em] text-muted">Status</h2>
            <p className="mt-2 font-display text-2xl text-foreground">{copy?.title}</p>
            <p className="mt-2 text-sm text-muted">{copy?.body}</p>
            {data.latestDecision?.decision === 'REJECTED' && data.latestDecision.reason && (
              <div className="mt-4 rounded-md border border-red-500/25 bg-red-500/5 p-4">
                <h3 className="text-xs uppercase tracking-[0.12em] text-red-200">Reason for this decision</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{data.latestDecision.reason}</p>
                <p className="mt-2 text-xs text-muted">Decision recorded {dateTime.format(new Date(data.latestDecision.createdAt))}</p>
              </div>
            )}
          </section>

          {data.activeRequest && (
            <section aria-labelledby="task" className="space-y-3">
              <h2 id="task" className="font-display text-xl text-foreground">Current request</h2>
              <ul><Row request={data.activeRequest} /></ul>
            </section>
          )}

          <section aria-labelledby="history" className="space-y-3">
            <h2 id="history" className="font-display text-xl text-foreground">Earlier requests</h2>
            {data.history.length === 0 ? (
              <p className="text-sm text-muted">No earlier requests.</p>
            ) : (
              <ul className="space-y-3">{data.history.map((r) => <Row key={r.id} request={r} />)}</ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

export default function StudioVerificationPage() {
  return (
    <ProtectedRoute allowRoles={['ARTIST']}>
      <Content />
    </ProtectedRoute>
  );
}
