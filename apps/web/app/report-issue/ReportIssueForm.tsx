'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function ReportIssueForm({
  targetType,
  targetSlug,
  targetName,
}: {
  targetType: 'USER' | 'ARTWORK' | null;
  targetSlug: string;
  targetName: string;
}) {
  const { firebaseUser, loading: authLoading } = useAuth();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firebaseUser || !targetType || !targetSlug) return;
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      const token = await firebaseUser.getIdToken();
      const response = await fetch(`${API_URL}/api/v1/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetType,
          targetSlug,
          reason: reason.trim(),
          description: description.trim() || undefined,
        }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok)
        throw new Error(body?.message ?? 'We could not submit your report. Try again.');
      setMessage('Your report has been sent to the moderation team.');
      setReason('');
      setDescription('');
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : 'We could not submit your report. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-gutter py-16 sm:py-24">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Trust & Safety</p>
      <h1 className="mt-2 font-display text-3xl text-foreground">
        Report {targetName || (targetType === 'USER' ? 'an artist' : 'an artwork')}
      </h1>
      {targetType && targetSlug ? (
        <>
          <p className="mt-3 text-sm text-muted">
            Reports are reviewed by our moderation team. Include relevant details, but do not
            include passwords or payment credentials.
          </p>
          {authLoading ? (
            <p role="status" className="mt-6 text-sm text-muted">
              Checking your sign-in…
            </p>
          ) : !firebaseUser ? (
            <p className="mt-6 rounded border border-border/20 p-4 text-sm">
              Please{' '}
              <Link
                className="text-accent underline"
                href={`/login?redirect=${encodeURIComponent(`/report-issue?targetType=${targetType}&targetSlug=${targetSlug}&targetName=${targetName}`)}`}
              >
                sign in
              </Link>{' '}
              to submit a report.
            </p>
          ) : (
            <form className="mt-8 space-y-5" onSubmit={submit}>
              <label className="block text-sm text-foreground">
                Reason
                <input
                  required
                  minLength={3}
                  maxLength={120}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-2 block w-full rounded border border-border/20 bg-surface px-3 py-2"
                />
              </label>
              <label className="block text-sm text-foreground">
                Additional details (optional)
                <textarea
                  maxLength={2000}
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-2 block w-full rounded border border-border/20 bg-surface px-3 py-2"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-accent px-5 py-3 text-sm text-background disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send report'}
              </button>
            </form>
          )}
          {message && (
            <p role={failed ? 'alert' : 'status'} className="mt-5 text-sm">
              {message}
            </p>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Reports can be submitted from an artist or artwork page. For other account or order
          issues, please use{' '}
          <Link className="text-accent underline" href="/contact">
            Contact
          </Link>
          .
        </p>
      )}
    </main>
  );
}
