'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { AdminDialog } from '../../../../components/admin/AdminDialog';
import { useAdminSession } from '../../../../components/admin/AdminSessionContext';
import { ErrorBox, PageHeader, StatusPill } from '../../../../components/admin/AdminUi';
import { VerificationRequestComposer } from '../../../../components/admin/VerificationRequestComposer';
import { AdminApiError } from '../../../../lib/adminApi';
import {
  cancelInfoRequest,
  createInfoRequest,
  decideVerification,
  fetchReviewDetail,
  type NewRequestField,
  type ReviewDetail,
  type ReviewRound,
} from '../../../../lib/verificationApi';
import { REQUEST_STATUS } from '../../../../lib/verificationStatus';

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const name = (p: { firstName: string; lastName: string } | null) =>
  p ? `${p.firstName} ${p.lastName}` : 'Unknown';

// Only ever render a submitted value as a link if it is a valid HTTPS URL.
function safeHref(value: string): string | null {
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return null;
  const trimmed = value.trim();
  if (!/^https:\/\//i.test(trimmed) || trimmed.includes('\\')) return null;
  const authority = trimmed.match(/^https:\/\/([^/?#\\\s]+)(?:[/?#]|$)/i)?.[1];
  if (!authority) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' &&
      url.hostname &&
      !authority.includes('@') &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function SafeLink({ value }: { value: string }) {
  const href = safeHref(value);
  if (!href) return <span className="break-all">{value}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open external link: ${value.trim()}`}
      className="break-all text-accent underline underline-offset-4"
    >
      {value.trim()} <span className="text-xs no-underline">(external link)</span>
    </a>
  );
}

type Dialog = 'request' | 'cancel' | 'approve' | 'reject' | null;

function ReasonDialog({
  title,
  description,
  confirmLabel,
  required,
  destructive,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  required: boolean;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ok = required ? reason.trim().length >= 10 : true;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
      setBusy(false);
    }
  }

  return (
    <AdminDialog title={title} description={description} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm text-foreground">
          Reason {required ? <span className="text-muted">(required, at least 10 characters)</span> : <span className="text-muted">(optional)</span>}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={1000}
            className="mt-1 w-full rounded-md border border-border/15 bg-background px-3 py-2 text-sm"
          />
        </label>
        {error && <ErrorBox message={error} />}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md border border-border/15 px-4 py-2 text-sm disabled:opacity-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!ok || busy}
            className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40 ${
              destructive ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-accent text-accent-foreground'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

function Round({ round }: { round: ReviewRound }) {
  return (
    <li className="rounded-lg border border-border/10 bg-surface p-5 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-foreground">
          Round {round.round} · {REQUEST_STATUS[round.status].staff}
        </p>
        <p className="text-xs text-muted">
          Requested {dateTime.format(new Date(round.createdAt))} by {name(round.requestedBy)}
        </p>
      </div>
      {round.message && <p className="mt-2 text-foreground/80">Message: {round.message}</p>}

      <h4 className="mt-4 text-xs uppercase tracking-[0.12em] text-muted">What was requested</h4>
      <ul className="mt-2 space-y-2">
        {round.fields.map((f) => (
          <li key={f.id}>
            <span className="text-foreground">{f.label}</span>{' '}
            <span className="text-xs text-muted">({f.required ? 'required' : 'optional'})</span>
            <p className="text-foreground/70">{f.instructions}</p>
          </li>
        ))}
      </ul>

      {round.submission ? (
        <>
          <h4 className="mt-4 text-xs uppercase tracking-[0.12em] text-muted">
            Artist response · {dateTime.format(new Date(round.submission.submittedAt))}
          </h4>
          <dl className="mt-2 space-y-2">
            {round.fields.map((f) => {
              const answer = round.submission!.responses.find((r) => r.fieldId === f.id);
              return (
                <div key={f.id}>
                  <dt className="text-xs text-muted">{f.label}</dt>
                  <dd className="whitespace-pre-wrap text-foreground">
                    {answer ? f.type === 'PORTFOLIO_URL' ? <SafeLink value={answer.value} /> : answer.value : <span className="text-muted">Not provided</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
        </>
      ) : round.status === 'AWAITING_ARTIST_INPUT' ? (
        <p className="mt-4 text-muted">No response yet.</p>
      ) : null}

      {round.status === 'CANCELLED' && (
        <p className="mt-4 text-foreground/80">
          Cancelled {round.cancelledAt && dateTime.format(new Date(round.cancelledAt))} by {name(round.cancelledBy)}
          {round.cancellationReason ? `: ${round.cancellationReason}` : ''}
        </p>
      )}
    </li>
  );
}

export default function ArtistReviewPage() {
  const { artistId } = useParams<{ artistId: string }>();
  const { can } = useAdminSession();
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerBusy, setComposerBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    fetchReviewDetail(artistId)
      .then(setDetail)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load this application.'));
  }, [artistId]);

  useEffect(load, [load]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link href={'/admin/artist-verification' as Route} className="text-sm text-muted hover:text-foreground">← Applications</Link>
        <ErrorBox message={error} onRetry={load} />
      </div>
    );
  }
  if (!detail) return <div className="h-40 animate-pulse rounded-lg bg-surface" role="status" aria-label="Loading application" />;

  const { artist } = detail;
  const open = detail.requests.find((r) => r.status === 'AWAITING_ARTIST_INPUT' || r.status === 'AWAITING_REVIEW');
  const pending = artist.verificationStatus === 'PENDING';
  const canReview = can('artists.review') && pending;
  const waitingOnArtist = open?.status === 'AWAITING_ARTIST_INPUT';

  const nextStep = !pending
    ? `This application is ${artist.verificationStatus.toLowerCase()}.`
    : !open
      ? 'No request has been sent. Review the profile, then request information or decide.'
      : waitingOnArtist
        ? 'Waiting for the artist to respond. Cancel the request if it is no longer needed.'
        : 'The artist has responded. Review the response, then decide or ask for more.';

  const done = (message: string) => {
    setDialog(null);
    setNotice(message);
    load();
  };

  async function sendRequest(payload: { message?: string; fields: NewRequestField[] }) {
    setComposerBusy(true);
    setComposerError(null);
    try {
      await createInfoRequest(artistId, payload);
      setComposerBusy(false);
      done('Request sent. The artist has been notified.');
    } catch (err) {
      setComposerBusy(false);
      setComposerError(err instanceof Error ? err.message : 'That did not go through.');
      if (err instanceof AdminApiError && err.status === 409) load();
    }
  }

  return (
    <div className="space-y-10">
      <Link href={'/admin/artist-verification' as Route} className="text-sm text-muted hover:text-foreground">← Applications</Link>

      <PageHeader
        eyebrow="Artist verification"
        title={artist.displayName}
        description={`${artist.user.firstName} ${artist.user.lastName} · ${artist.user.email}`}
        action={<StatusPill status={artist.verificationStatus} />}
      />

      {notice && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      <section aria-labelledby="next" className="rounded-lg border border-border/10 bg-surface p-5">
        <h2 id="next" className="text-xs uppercase tracking-[0.14em] text-muted">What happens next</h2>
        <p className="mt-2 text-sm text-foreground">{nextStep}</p>
        {open && (
          <p className="mt-1 text-xs text-muted">
            Current request: round {open.round} · {REQUEST_STATUS[open.status].staff}
          </p>
        )}
      </section>

      {canReview && (
        <section aria-labelledby="actions" className="space-y-3">
          <h2 id="actions" className="font-display text-xl text-foreground">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {!waitingOnArtist && (
              <button type="button" onClick={() => { setNotice(null); setComposerError(null); setDialog('request'); }} className="rounded-md border border-border/20 px-4 py-2 text-sm hover:border-accent">
                {open ? 'Request more information' : 'Request information'}
              </button>
            )}
            {open && (
              <button type="button" onClick={() => { setNotice(null); setDialog('cancel'); }} className="rounded-md border border-border/20 px-4 py-2 text-sm hover:border-accent">
                Cancel current request
              </button>
            )}
            {!waitingOnArtist && (
              <>
                <button type="button" onClick={() => { setNotice(null); setDialog('approve'); }} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90">
                  Approve verification
                </button>
                <button type="button" onClick={() => { setNotice(null); setDialog('reject'); }} className="rounded-md border border-red-500/40 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10">
                  Reject
                </button>
              </>
            )}
          </div>
          {waitingOnArtist && (
            <p className="text-xs text-muted">Final decisions are available once the artist responds or the request is cancelled.</p>
          )}
        </section>
      )}

      <section aria-labelledby="profile" className="rounded-lg border border-border/10 bg-surface p-5">
        <h2 id="profile" className="font-display text-xl text-foreground">Profile</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs uppercase tracking-[0.12em] text-muted">Location</dt><dd className="mt-1">{artist.location ?? 'Not provided'}</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-muted">Applied</dt><dd className="mt-1">{dateTime.format(new Date(artist.createdAt))}</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-muted">Artworks</dt><dd className="mt-1">{artist._count.artworks}</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-muted">Account</dt><dd className="mt-1">{artist.user.status.replace(/_/g, ' ').toLowerCase()}</dd></div>
          {artist.website && <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-[0.12em] text-muted">Website (self-reported)</dt><dd className="mt-1"><SafeLink value={artist.website} /></dd></div>}
          {artist.biography && <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-[0.12em] text-muted">Biography</dt><dd className="mt-1 whitespace-pre-wrap">{artist.biography}</dd></div>}
          {artist.artisticStatement && <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-[0.12em] text-muted">Artistic statement</dt><dd className="mt-1 whitespace-pre-wrap">{artist.artisticStatement}</dd></div>}
          {artist.socialLinks.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-[0.12em] text-muted">Social links (self-reported)</dt>
              <dd className="mt-1 space-y-1">{artist.socialLinks.map((l) => <div key={l.platform}>{l.platform}: <SafeLink value={l.url} /></div>)}</dd>
            </div>
          )}
        </dl>
        <p className="mt-4 text-xs text-muted">Links are supplied by the artist. A working link does not prove ownership of the work.</p>
      </section>

      <section aria-labelledby="rounds" className="space-y-3">
        <h2 id="rounds" className="font-display text-xl text-foreground">Request history</h2>
        {detail.requests.length === 0 ? (
          <p className="text-sm text-muted">No information has been requested from this artist.</p>
        ) : (
          <ol className="space-y-3">{detail.requests.map((r) => <Round key={r.id} round={r} />)}</ol>
        )}
      </section>

      <section aria-labelledby="decisions" className="space-y-3">
        <h2 id="decisions" className="font-display text-xl text-foreground">Decisions</h2>
        {detail.decisions.length === 0 ? (
          <p className="text-sm text-muted">No final decision has been made.</p>
        ) : (
          <ol className="space-y-3">
            {detail.decisions.map((d) => (
              <li key={d.id} className="rounded-lg border border-border/10 bg-surface px-5 py-4 text-sm">
                <p className="text-foreground"><span className="font-medium">{d.decision.toLowerCase()}</span> by {name(d.decidedBy)} · {dateTime.format(new Date(d.createdAt))}</p>
                {d.reason && <p className="mt-1 text-foreground/80">{d.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {dialog === 'request' && (
        <AdminDialog
          title="Request information"
          description="Choose what you need from the artist. They are notified in the app and see this on their dashboard."
          onClose={() => setDialog(null)}
          busy={composerBusy}
        >
          <VerificationRequestComposer
            onSubmit={sendRequest}
            onCancel={() => setDialog(null)}
            busy={composerBusy}
            error={composerError}
          />
        </AdminDialog>
      )}
      {dialog === 'cancel' && open && (
        <ReasonDialog
          title={`Cancel round ${open.round}`}
          description="The request stays in the history with your reason. The artist is told it was withdrawn."
          confirmLabel="Confirm: cancel request"
          required
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await cancelInfoRequest(open.id, reason);
            done('Request cancelled.');
          }}
        />
      )}
      {dialog === 'approve' && (
        <ReasonDialog
          title={`Approve ${artist.displayName}`}
          description="This verifies the artist. They will be able to sell artwork and receive new commission requests. This cannot be undone here."
          confirmLabel="Confirm: approve"
          required={false}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await decideVerification(artistId, { decision: 'APPROVE', reason: reason || undefined });
            done('Artist verified.');
          }}
        />
      )}
      {dialog === 'reject' && (
        <ReasonDialog
          title={`Reject ${artist.displayName}`}
          description="This rejects the application. The reason is recorded in the review history and shown to the artist."
          confirmLabel="Confirm: reject"
          required
          destructive
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await decideVerification(artistId, { decision: 'REJECT', reason });
            done('Application rejected.');
          }}
        />
      )}
    </div>
  );
}
