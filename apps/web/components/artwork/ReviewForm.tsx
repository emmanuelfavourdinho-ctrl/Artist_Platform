'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { FormAlert } from '../auth/FormAlert';
import { FieldError } from '../auth/FieldError';
import { fieldErrorsFrom, type ApiErrorBody } from '../../lib/apiTypes';

/*
  Explainer: unlike login/register, this POST needs the visitor's
  EXISTING session cookie to reach the backend — the Route Handler this
  calls (app/api/artworks/[artworkId]/reviews/route.ts) forwards the
  incoming request's cookie header to the real API, rather than issuing
  a new one the way login does.
*/
export function ReviewForm({ artworkId }: { artworkId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setNeedsLogin(false);
    setFieldErrors({});

    try {
      const res = await fetch(`/api/artworks/${artworkId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, title: title || undefined, comment }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setNeedsLogin(true);
          return;
        }
        const err = data as ApiErrorBody;
        setFormError(err.message ?? 'Something went wrong. Try again.');
        setFieldErrors(fieldErrorsFrom(err.details));
        return;
      }

      setSuccess(true);
      setComment('');
      setTitle('');
      router.refresh();
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <p className="rounded-md border border-foreground/10 bg-surface px-4 py-3 text-sm text-foreground/80">
        Thanks — your review will appear once it&apos;s been approved.
      </p>
    );
  }

  if (needsLogin) {
    return (
      <p className="rounded-md border border-foreground/10 bg-surface px-4 py-3 text-sm text-foreground/80">
        <Link href="/login" className="font-medium text-accent underline underline-offset-2">
          Log in
        </Link>{' '}
        to leave a review.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && <FormAlert message={formError} />}

      <div>
        <label
          htmlFor="rating"
          className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
        >
          Rating
        </label>
        <select
          id="rating"
          value={rating}
          onChange={(event) => setRating(Number(event.target.value))}
          className="mt-2 rounded-md border border-foreground/15 bg-surface px-4 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus-visible:outline-2"
        >
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {value} {value === 1 ? 'star' : 'stars'}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="title"
          className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
        >
          Title (optional)
        </label>
        <input
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-2 block w-full rounded-md border border-foreground/15 bg-surface px-4 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus-visible:outline-2"
        />
        <FieldError message={fieldErrors.title} />
      </div>

      <div>
        <label
          htmlFor="comment"
          className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
        >
          Your review
        </label>
        <textarea
          id="comment"
          required
          minLength={10}
          rows={4}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className="mt-2 block w-full rounded-md border border-foreground/15 bg-surface px-4 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus-visible:outline-2"
        />
        <FieldError message={fieldErrors.comment} />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="group inline-flex w-fit items-center gap-2.5 rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-all duration-300 ease-cinematic hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Submitting…' : 'Submit Review'}
      </button>
    </form>
  );
}
