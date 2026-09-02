import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { ModerationQueueItem } from '../../components/admin/ModerationQueueItem';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export const metadata = { title: 'Moderation — Artist_Platform' };

interface PendingReview {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string };
  artwork: { id: string; title: string } | null;
}

export default async function AdminPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const res = await fetch(`${API_URL}/api/v1/admin/reviews`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });

  if (res.status === 401) redirect('/login');

  if (res.status === 403) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <p className="font-display text-2xl text-foreground">Admin access required.</p>
        <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
          Your account doesn&apos;t have permission to view this page.
        </p>
      </div>
    );
  }

  if (!res.ok) {
    throw new Error(`Failed to load moderation queue (${res.status})`);
  }

  const body = await res.json();
  const reviews = body.data as PendingReview[];

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
          <p className="text-sm text-muted">The queue is empty — nothing waiting on moderation.</p>
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
