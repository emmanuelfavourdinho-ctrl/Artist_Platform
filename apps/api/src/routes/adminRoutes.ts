import { Router } from 'express';

import { listPendingReviews, moderateReview } from '../controllers/adminReviewController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { validateBody } from '../middleware/validateBody.js';
import { moderateReviewSchema } from '../validation/review.js';

export const adminRouter = Router();

adminRouter.get('/reviews', requireAdmin, asyncHandler(listPendingReviews));
adminRouter.patch(
  '/reviews/:id',
  requireAdmin,
  validateBody(moderateReviewSchema),
  asyncHandler(moderateReview),
);
