import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/httpError.js';
import type { SubmitReviewInput } from '../validation/review.js';

/*
  Explainer: this handles POST /api/v1/artworks/:artworkId/reviews. By
  the time this runs, TWO middleware have already run and passed:
  requireAuth (so req.user is guaranteed set — no logged-out submissions
  reach here) and validateBody (so req.body matches submitReviewSchema
  exactly). The reviewer's identity comes from req.user, never from the
  request body — there's no field a client could tamper with to submit
  a review as someone else.

  Status always starts PENDING via the schema's default — nothing here
  gives a submitter the ability to mark their own review approved.
*/
export async function submitReview(req: Request, res: Response) {
  const { artworkId } = req.params;
  const input = req.body as SubmitReviewInput;
  const userId = req.user!.id; // requireAuth guarantees this is set

  const artwork = await prisma.artwork.findUnique({
    where: { id: artworkId },
    select: { id: true },
  });
  if (!artwork) {
    throw new HttpError(404, 'Artwork not found', { code: 'ARTWORK_NOT_FOUND' });
  }

  // schema.prisma has no unique constraint stopping the same user from
  // reviewing the same artwork twice — enforced here at the application
  // layer instead. Worth adding `@@unique([userId, artworkId])` to the
  // Review model at the DB level too, for the same defense-in-depth
  // reasoning as the rating-range CHECK constraint noted in the schema.
  const existingReview = await prisma.review.findFirst({
    where: { userId, artworkId },
    select: { id: true },
  });
  if (existingReview) {
    throw new HttpError(409, 'You have already reviewed this artwork', {
      code: 'REVIEW_ALREADY_EXISTS',
    });
  }

  // Best-effort verified-purchase link: if this user has a delivered
  // order containing this artwork, attach it so the review can be
  // labeled "Verified Purchase" later. Not required yet — per the
  // schema's own note, enforcing orderItemId is a deliberate FUTURE
  // step, so a non-purchaser can still leave an (unverified) review
  // today.
  const verifiedOrderItem = await prisma.orderItem.findFirst({
    where: { artworkId, order: { userId, status: 'DELIVERED' } },
    select: { id: true },
  });

  const review = await prisma.review.create({
    data: {
      userId,
      artworkId,
      orderItemId: verifiedOrderItem?.id,
      rating: input.rating,
      title: input.title,
      comment: input.comment,
    },
  });

  res.status(201).json({
    status: 'success',
    message: 'Thanks! Your review will appear once it has been approved.',
    data: {
      id: review.id,
      status: review.status,
      verifiedPurchase: Boolean(review.orderItemId),
    },
  });
}

/*
  Explainer: this handles GET /api/v1/artworks/:artworkId/reviews — the
  public artwork page. `status: 'APPROVED'` is the entire enforcement of
  "only approved reviews are public," baked into the query itself.

  There's no authorName column on Review anymore — the reviewer's
  display name comes from a join to User. Only a first-name + last-
  initial is exposed publicly (e.g. "Jane D."); a full last name on a
  public review page is more identity exposure than most reviewers
  expect.
*/
export async function listApprovedReviews(req: Request, res: Response) {
  const { artworkId } = req.params;

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { artworkId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        rating: true,
        title: true,
        comment: true,
        createdAt: true,
        orderItemId: true,
        user: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.review.count({ where: { artworkId, status: 'APPROVED' } }),
  ]);

  const data = reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    title: review.title,
    comment: review.comment,
    createdAt: review.createdAt,
    verifiedPurchase: Boolean(review.orderItemId),
    reviewerName: `${review.user.firstName} ${review.user.lastName.charAt(0)}.`,
  }));

  res.json({
    status: 'success',
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
