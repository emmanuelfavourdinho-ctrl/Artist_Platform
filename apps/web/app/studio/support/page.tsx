'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { StudioShell } from '../../../components/studio/StudioShell';
import { fetchMyProfile, type ProfileData } from '../../../lib/userApi';
import { submitContactMessage } from '../../../lib/contactApi';
import { fetchStudioDisputes, respondToStudioDispute, type StudioDispute } from '../../../lib/studioApi';

function SupportContent() {
  const [disputes, setDisputes] = useState<StudioDispute[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [contactBusy, setContactBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [disputeRows, userProfile] = await Promise.all([fetchStudioDisputes(), fetchMyProfile()]);
      setDisputes(disputeRows);
      setProfile(userProfile);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your support workspace.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function respond(dispute: StudioDispute) {
    const response = responseDrafts[dispute.id]?.trim() ?? '';
    if (response.length < 10) {
      setError('Please provide at least 10 characters in your response.');
      return;
    }
    setBusyId(dispute.id);
    setError('');
    setFeedback('');
    try {
      await respondToStudioDispute({ disputeId: dispute.id, response });
      setFeedback(`Your response for ${dispute.order.orderNumber} was recorded. The dispute remains open for review.`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Your response could not be saved.');
    } finally {
      setBusyId(null);
    }
  }

  async function contact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setContactBusy(true);
    setError('');
    setFeedback('');
    try {
      await submitContactMessage({
        name: `${profile.firstName} ${profile.lastName}`.trim(),
        email: profile.email,
        subject: subject.trim(),
        message: message.trim(),
      });
      setSubject('');
      setMessage('');
      setFeedback('Your support message was recorded.');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Your support message could not be sent.');
    } finally {
      setContactBusy(false);
    }
  }

  return (
    <StudioShell>
      <header className="border-b border-border/10 pb-6">
        <p className="text-xs uppercase tracking-[.18em] text-accent">Help & resolution</p>
        <h1 className="mt-2 font-display text-4xl">Support & Disputes</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">Respond to delivery issues and contact the Fine Arts support team.</p>
      </header>
      {feedback && <p role="status" className="mt-4 text-sm text-emerald-400">{feedback}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}

      <section className="mt-8" aria-labelledby="disputes-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs uppercase tracking-wide text-muted">Order issues</p><h2 id="disputes-title" className="mt-1 font-display text-2xl">My disputes</h2></div>
          <p className="text-xs text-muted">A response is evidence for review; it does not resolve or dismiss a dispute.</p>
        </div>
        {loading ? (
          <div role="status" aria-label="Loading disputes" className="mt-4 h-32 animate-pulse rounded-lg bg-surface" />
        ) : disputes.length === 0 ? (
          <p className="mt-4 border-y border-border/10 py-6 text-sm text-muted">No delivery disputes are associated with your orders.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border/10 border-y border-border/10">
            {disputes.map((dispute) => (
              <li key={dispute.id} className="py-5">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-accent">{dispute.order.orderNumber} · {dispute.status}</p>
                    <h3 className="mt-1 font-display text-xl">{dispute.reason.replaceAll('_', ' ')}</h3>
                  </div>
                  <span className="text-xs text-muted">Release status: {dispute.order.releaseStatus}</span>
                </div>
                <p className="mt-2 text-sm">{dispute.description}</p>
                <p className="mt-2 text-xs text-muted">Opened {new Date(dispute.createdAt).toLocaleString()} · Buyer evidence references: {dispute.evidenceReferences.length}</p>
                {dispute.order.items.length > 0 && <p className="mt-1 text-xs text-muted">Artwork: {dispute.order.items.map((item) => item.title).join(', ')}</p>}
                <ol aria-label="Order timeline" className="mt-3 space-y-1 border-l border-border/20 pl-3 text-xs text-muted">
                  {dispute.order.deliveryEvents.map((event, index) => <li key={`${event.eventType}-${event.occurredAt}-${index}`}>{new Date(event.occurredAt).toLocaleString()} · {event.eventType.replaceAll('_', ' ')}</li>)}
                </ol>
                {dispute.order.artistResponseDeadline && dispute.status === 'OPEN' && <p className="mt-1 text-xs text-muted">Response window ends {new Date(dispute.order.artistResponseDeadline).toLocaleString()}</p>}
                {dispute.artistResponse && (
                  <div className="mt-4 border-l-2 border-border/30 pl-3">
                    <p className="text-xs uppercase tracking-wide text-muted">Your response · {dispute.artistRespondedAt ? new Date(dispute.artistRespondedAt).toLocaleString() : ''}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{dispute.artistResponse}</p>
                    {!!dispute.artistEvidenceReferences.length && <p className="mt-2 text-xs text-muted">Your evidence references: {dispute.artistEvidenceReferences.length}</p>}
                  </div>
                )}
                {dispute.resolutionNote && (
                  <div className="mt-4 border-l-2 border-accent/50 pl-3">
                    <p className="text-xs uppercase tracking-wide text-muted">Resolution · {dispute.resolvedAt ? new Date(dispute.resolvedAt).toLocaleString() : ''}</p>
                    <p className="mt-1 text-sm">{dispute.resolutionNote}</p>
                  </div>
                )}
                {dispute.status === 'OPEN' && !dispute.artistRespondedAt && (
                  <div className="mt-4">
                    <label htmlFor={`response-${dispute.id}`} className="text-sm">Your response to the review
                      <textarea id={`response-${dispute.id}`} minLength={10} maxLength={2000} rows={4} value={responseDrafts[dispute.id] ?? ''} onChange={(event) => setResponseDrafts((current) => ({ ...current, [dispute.id]: event.target.value }))} className="mt-1 w-full rounded border border-border/15 bg-surface px-3 py-2" />
                    </label>
                    <button type="button" disabled={busyId === dispute.id || (responseDrafts[dispute.id]?.trim().length ?? 0) < 10} onClick={() => void respond(dispute)} className="mt-2 min-h-11 rounded bg-accent px-4 text-sm text-background disabled:opacity-50">
                      {busyId === dispute.id ? 'Sending…' : 'Submit response'}
                    </button>
                  </div>
                )}
                {dispute.status !== 'OPEN' && <p className="mt-3 text-sm text-muted">This issue is closed. Contact support if you need help understanding the resolution.</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 border-t border-border/10 pt-8" aria-labelledby="contact-title">
        <h2 id="contact-title" className="font-display text-2xl">Contact support</h2>
        <p className="mt-1 text-sm text-muted">Your message is stored for the support team. In-app support request history is not available yet.</p>
        <form onSubmit={(event) => void contact(event)} className="mt-4 max-w-2xl space-y-4">
          <label className="block text-sm">Subject
            <input required minLength={3} maxLength={200} value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-1 min-h-11 w-full rounded border border-border/15 bg-surface px-3" />
          </label>
          <label className="block text-sm">Message
            <textarea required minLength={10} maxLength={5000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} className="mt-1 w-full rounded border border-border/15 bg-surface px-3 py-2" />
          </label>
          <button type="submit" disabled={!profile || contactBusy} className="min-h-11 rounded bg-accent px-5 text-sm font-medium text-background disabled:opacity-50">{contactBusy ? 'Sending…' : 'Send to support'}</button>
        </form>
      </section>
    </StudioShell>
  );
}

export default function StudioSupportPage() {
  return <ProtectedRoute allowRoles={['ARTIST']}><SupportContent /></ProtectedRoute>;
}
