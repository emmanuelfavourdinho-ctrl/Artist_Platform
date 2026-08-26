import { Router } from 'express';

import { listApprovedReviews, submitReview } from '../controllers/reviewControllers.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { reviewRateLimiter } from '../middleware/reviewRateLimiter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validateBody.js';
import { submitReviewSchema } from '../validation/review.js';

export const reviewsRouter = Router();

/*
    Explainer: order matters here, left to right:
        1. requireAuth        — is anyone even logged in?
        2. reviewRateLimiter  — is this account submitting too often?
        3. validateBody(...)  — is the data itself well-formed?
        4. asyncHandler(...)  — actually create the review
    A request failing any earlier step never reaches the next one.
    requireAuth runs first since there's no point rate-limiting or
    validating a request from someone who isn't even logged in.
    */
reviewsRouter.post(
  '/:artworkId/reviews',
  requireAuth,
  reviewRateLimiter,
  validateBody(submitReviewSchema),
  asyncHandler(submitReview),
);

reviewsRouter.get('/:artworkId/reviews', asyncHandler(listApprovedReviews));
