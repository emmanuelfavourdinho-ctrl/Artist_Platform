'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

interface PendingReview {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string };
  artwork: { id: string; title: string } | null;
}

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

export function ModerationQueueItem({ review }: { review: PendingReview }) {
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: 'approve' | 'reject') {
    setPending(action);
    setError(null);

    try {
      const token = await firebaseUser?.getIdToken();
      const res = await fetch(`${API_URL}/api/v1/admin/reviews/${review.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message ?? 'Something went wrong.');
        return;
      }

      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <li className="rounded-lg border border-border/10 bg-surface p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground">
            {initials(review.user.firstName, review.user.lastName)}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {review.artwork?.title ?? 'Unknown artwork'}
              </p>
              <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-accent">
                {review.rating}/5
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {review.user.firstName} {review.user.lastName} · {review.user.email}
            </p>
            {review.title && (
              <p className="mt-3 text-sm font-medium text-foreground">{review.title}</p>
            )}
            {review.comment && (
              <p className="mt-1 text-sm leading-6 text-foreground/80">{review.comment}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-2 sm:pl-4">
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => act('approve')}
            className="rounded-full bg-accent px-4 py-2 text-xs font-medium uppercase tracking-[0.1em] text-accent-foreground transition-colors duration-200 hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending === 'approve' ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => act('reject')}
            className="rounded-full border border-foreground/25 px-4 py-2 text-xs font-medium uppercase tracking-[0.1em] text-foreground transition-colors duration-200 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-xs text-red-400">{error}</p>}
    </li>
  );
}
