'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { ProtectedRoute } from '../../../../components/auth/ProtectedRoute';
import { VerificationRequestForm } from '../../../../components/studio/VerificationRequestForm';
import { AdminApiError } from '../../../../lib/adminApi';
import {
  fetchOwnRequest,
  submitOwnResponse,
  type ArtistRequest,
  type SubmittedResponse,
} from '../../../../lib/verificationApi';
import { REQUEST_STATUS } from '../../../../lib/verificationStatus';

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function Content() {
  const { id } = useParams<{ id: string }>();
  const [request, setRequest] = useState<ArtistRequest | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const load = useCallback(() => {
    setError(null);
    fetchOwnRequest(id)
      .then(setRequest)
      .catch((err: unknown) =>
        setError({
          message: err instanceof Error ? err.message : 'Could not load this request.',
          notFound: err instanceof AdminApiError && err.status === 404,
        }),
      );
  }, [id]);
  useEffect(load, [load]);

  async function submit(responses: SubmittedResponse[]): Promise<Record<string, string> | void> {
    setFormError(null);
    try {
      await submitOwnResponse(id, responses);
      setJustSubmitted(true);
      load();
    } catch (err) {
      if (err instanceof AdminApiError && err.issues.length > 0) {
        // Field-level errors from the server, shown next to each field.
        return Object.fromEntries(err.issues.map((i) => [i.path, i.message]));
      }
      setFormError(err instanceof Error ? err.message : 'We could not submit your response.');
      // The task may have changed (cancelled, already submitted) — refresh it.
      if (err instanceof AdminApiError && err.status === 409) load();
    }
  }

  const back = (
    <Link href={'/studio/verification' as Route} className="text-sm text-muted hover:text-foreground">← Verification</Link>
  );

  if (error) {
    return (
      <main className="mx-auto min-h-screen max-w-content px-gutter py-16 sm:py-24">
        {back}
        <div role="alert" className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          {error.notFound ? 'We could not find that request. It may belong to another account.' : error.message}
        </div>
      </main>
    );
  }
  if (!request) {
    return (
      <main className="mx-auto min-h-screen max-w-content px-gutter py-16 sm:py-24">
        {back}
        <div className="mt-6 h-40 animate-pulse rounded-lg bg-surface" role="status" aria-label="Loading" />
      </main>
    );
  }

  const status = REQUEST_STATUS[request.status];
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-gutter py-16 sm:py-24">
      {back}
      <h1 className="mt-4 font-display text-4xl text-foreground">Verification request {request.round}</h1>
      <p className="mt-2 text-sm text-muted">
        {status.artist} · Sent {dateTime.format(new Date(request.createdAt))}
      </p>

      {justSubmitted && request.status === 'AWAITING_REVIEW' && (
        <p role="status" className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Thank you — your response was submitted and is now awaiting review. We will notify you of the outcome.
        </p>
      )}

      {request.message && (
        <section aria-labelledby="why" className="mt-8">
          <h2 id="why" className="text-xs uppercase tracking-[0.14em] text-muted">Why we are asking</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{request.message}</p>
        </section>
      )}

      <div className="mt-8">
        {request.status === 'AWAITING_ARTIST_INPUT' && (
          <>
            {formError && (
              <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {formError}
              </p>
            )}
            <VerificationRequestForm request={request} onSubmit={submit} />
          </>
        )}

        {request.status === 'AWAITING_REVIEW' && (
          <section aria-labelledby="sent">
            <h2 id="sent" className="font-display text-xl text-foreground">Your response</h2>
            <p className="mt-1 text-sm text-muted">
              {request.submission && `Submitted ${dateTime.format(new Date(request.submission.submittedAt))}. `}
              Our team will review it.
            </p>
            <dl className="mt-4 space-y-4">
              {request.fields.map((f) => {
                const answer = request.submission?.responses.find((r) => r.fieldId === f.id);
                return (
                  <div key={f.id}>
                    <dt className="text-xs text-muted">{f.label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-all text-sm text-foreground">{answer?.value ?? 'Not provided'}</dd>
                  </div>
                );
              })}
            </dl>
          </section>
        )}

        {request.status === 'COMPLETED' && (
          <p className="text-sm text-muted">This request is complete. There is nothing more to do here.</p>
        )}
        {request.status === 'CANCELLED' && (
          <p className="text-sm text-muted">This request was cancelled. You do not need to respond.</p>
        )}
      </div>
    </main>
  );
}

export default function StudioVerificationRequestPage() {
  return (
    <ProtectedRoute allowRoles={['ARTIST']}>
      <Content />
    </ProtectedRoute>
  );
}
