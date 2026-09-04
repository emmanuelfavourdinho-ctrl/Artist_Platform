import type { ArtistReview } from '../../lib/artistsApi';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

export function ArtistReviewsList({ reviews }: { reviews: ArtistReview[] }) {
  if (reviews.length === 0) {
    return <p className="mt-6 text-sm text-muted">No reviews yet.</p>;
  }

  return (
    <ul className="mt-6 flex flex-col gap-6">
      {reviews.map((review) => (
        <li key={review.id} className="border-t border-foreground/10 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div
                aria-label={`${review.rating} out of 5 stars`}
                className="flex gap-0.5 text-accent"
              >
                {Array.from({ length: 5 }, (_, index) => (
                  <span key={index} aria-hidden="true">
                    {index < review.rating ? '★' : '☆'}
                  </span>
                ))}
              </div>
              {review.verifiedPurchase && (
                <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
                  Verified Purchase
                </span>
              )}
            </div>
            <span className="text-xs text-muted">
              {dateFormatter.format(new Date(review.createdAt))}
            </span>
          </div>
          {review.title && (
            <p className="mt-2 font-display text-base text-foreground">{review.title}</p>
          )}
          {review.comment && (
            <p className="mt-2 text-sm leading-6 text-foreground/80">{review.comment}</p>
          )}
          <p className="mt-2 text-xs text-muted">
            {review.reviewerName}
            {review.artworkTitle && <> · on {review.artworkTitle}</>}
          </p>
        </li>
      ))}
    </ul>
  );
}
