'use client';

import { useEffect, useState } from 'react';
import { ModerationQueueItem } from '../../../components/admin/ModerationQueueItem';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { STAFF_ROLE_NAMES } from '../../../lib/adminApi';
import { useAuth } from '../../../context/AuthContext';

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

interface QueueResponse {
  data: PendingReview[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const PAGE_SIZE = 10;

function ReviewsContent() {
  const { firebaseUser } = useAuth();
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadQueue() {
      setLoading(true);
      setError(null);
      try {
        const token = await firebaseUser?.getIdToken();
        const response = await fetch(
          `${API_URL}/api/v1/admin/reviews?page=${page}&pageSize=${PAGE_SIZE}`,
          {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
          },
        );
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const body = (await response.json()) as QueueResponse;
        if (cancelled) return;
        const lastPage = Math.max(1, body.pagination.totalPages);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setReviews(body.data);
        setTotal(body.pagination.total);
        setTotalPages(body.pagination.totalPages);
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
  }, [firebaseUser, page, refreshKey]);

  function refreshAfterModeration(stale = false) {
    setNotice(stale ? 'This review has already been moderated. The queue has been refreshed.' : null);
    if (reviews.length === 1 && page > 1) {
      setPage(page - 1);
    } else {
      setRefreshKey((key) => key + 1);
    }
  }

  function retry() {
    setRefreshKey((key) => key + 1);
  }

  if (loading)
    return <p className="py-24 text-center text-sm text-muted">Loading moderation queue…</p>;
  if (error)
    return (
      <div className="py-24 text-center">
        <p role="alert" className="text-sm text-red-400">{error}</p>
        <button type="button" onClick={retry} className="mt-3 text-sm text-accent underline">
          Try again
        </button>
      </div>
    );

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="font-display text-3xl text-foreground">Review Moderation</h1>
        <p className="text-sm text-muted">
          {total} pending review{total === 1 ? '' : 's'}
        </p>
      </div>

      {reviews.length === 0 ? (
        <div className="mt-16 rounded-lg border border-border/10 bg-surface px-8 py-16 text-center">
          <p className="text-sm text-muted">The queue is empty - nothing waiting on moderation.</p>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {reviews.map((review) => (
            <ModerationQueueItem
              key={review.id}
              review={review}
              onModerated={refreshAfterModeration}
            />
          ))}
        </ul>
      )}
      {notice && <p role="status" className="mt-4 text-center text-sm text-muted">{notice}</p>}
      {totalPages > 1 && (
        <nav aria-label="Review queue pagination" className="mt-8 flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-full border border-foreground/25 px-4 py-2 text-xs disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-muted">Page {page} of {totalPages}</span>
          <button
            type="button"
            disabled={loading || page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            className="rounded-full border border-foreground/25 px-4 py-2 text-xs disabled:opacity-50"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}

export default function AdminReviewsPage() {
  return (
    <ProtectedRoute allowRoles={STAFF_ROLE_NAMES}>
      <ReviewsContent />
    </ProtectedRoute>
  );
}
