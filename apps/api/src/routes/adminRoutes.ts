import { Router } from 'express';

import { listPendingReviews, moderateReview } from '../controllers/adminReviewController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { validateBody } from '../middleware/validateBody.js';
import { moderateReviewSchema } from '../validation/review.js';
import {
  listContactMessages,
  updateContactMessageStatus,
} from '../controllers/contactController.js';
import { updateContactMessageStatusSchema } from '../validation/contact.js';

export const adminRouter = Router();

adminRouter.get('/reviews', requireAdmin, asyncHandler(listPendingReviews));
adminRouter.patch(
  '/reviews/:id',
  requireAdmin,
  validateBody(moderateReviewSchema),
  asyncHandler(moderateReview),
);
adminRouter.get('/contact-messages', requireAdmin, asyncHandler(listContactMessages));
adminRouter.patch(
  '/contact-messages/:id',
  requireAdmin,
  validateBody(updateContactMessageStatusSchema),
  asyncHandler(updateContactMessageStatus),
);
