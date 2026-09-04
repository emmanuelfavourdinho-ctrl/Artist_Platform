'use client';

import { useEffect, useState } from 'react';
import { ModerationQueueItem } from '../../components/admin/ModerationQueueItem';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
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

function AdminContent() {
  const { firebaseUser } = useAuth();
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadQueue() {
      try {
        const token = await firebaseUser?.getIdToken();
        const response = await fetch(`${API_URL}/api/v1/admin/reviews`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const body = await response.json();
        if (!cancelled) setReviews(body.data as PendingReview[]);
      } catch {
        if (!cancelled) setError('We could not load the moderation queue. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (firebaseUser) void loadQueue();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  if (loading)
    return <p className="py-24 text-center text-sm text-muted">Loading moderation queue…</p>;
  if (error) return <p className="py-24 text-center text-sm text-red-400">{error}</p>;

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="font-display text-3xl text-foreground">Review Moderation</h1>
        <p className="text-sm text-muted">
          {reviews.length} pending review{reviews.length === 1 ? '' : 's'}
        </p>
      </div>

      {reviews.length === 0 ? (
        <div className="mt-16 rounded-lg border border-border/10 bg-surface px-8 py-16 text-center">
          <p className="text-sm text-muted">The queue is empty - nothing waiting on moderation.</p>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {reviews.map((review) => (
            <ModerationQueueItem key={review.id} review={review} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <ProtectedRoute allowRoles={['ADMIN']}>
      <AdminContent />
    </ProtectedRoute>
  );
}
