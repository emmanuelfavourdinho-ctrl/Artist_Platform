'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { fetchOwnVerification, type OwnVerification } from '../../lib/verificationApi';
import { REQUEST_STATUS } from '../../lib/verificationStatus';

/*
  Explainer: the persistent dashboard task. It reads the artist's current
  state straight from the API on every visit, so it is still there after a
  notification is read or dismissed, and works with no real-time push.
  Renders nothing once the artist is verified, and nothing if the call
  fails (the studio itself must never break because of this banner).
*/
export function VerificationTaskBanner() {
  const [data, setData] = useState<OwnVerification | null>(null);

  useEffect(() => {
    fetchOwnVerification()
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data || data.verificationStatus === 'VERIFIED') return null;

  const active = data.activeRequest;
  let heading: string;
  let body: string;
  let cta: { href: string; label: string } | null = null;

  if (data.verificationStatus === 'REJECTED') {
    heading = 'Your verification was not approved';
    body = 'Contact support if you would like to know more.';
    cta = { href: '/studio/verification', label: 'View details' };
  } else if (active?.status === 'AWAITING_ARTIST_INPUT') {
    heading = 'Action needed: more information required';
    body = 'Our team needs a little more information before they can verify your profile.';
    cta = { href: `/studio/verification/${active.id}`, label: 'Respond now' };
  } else if (active?.status === 'AWAITING_REVIEW') {
    heading = 'Verification in review';
    body = `${REQUEST_STATUS.AWAITING_REVIEW.artist}. We will let you know the outcome.`;
    cta = { href: `/studio/verification/${active.id}`, label: 'View your response' };
  } else {
    heading = 'Verification pending';
    body = 'Your profile is being reviewed. You can keep preparing your profile and draft artwork in the meantime.';
    cta = { href: '/studio/verification', label: 'Learn more' };
  }

  const urgent = active?.status === 'AWAITING_ARTIST_INPUT';
  return (
    <section
      aria-label="Verification"
      className={`mb-8 rounded-lg border px-5 py-4 ${urgent ? 'border-accent/50 bg-accent/5' : 'border-border/15 bg-surface'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{heading}</p>
          <p className="mt-1 text-sm text-muted">{body}</p>
        </div>
        {cta && (
          <Link
            href={cta.href as Route}
            className="rounded-md border border-border/20 px-4 py-2 text-sm text-foreground transition hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {cta.label}
          </Link>
        )}
      </div>
    </section>
  );
}
