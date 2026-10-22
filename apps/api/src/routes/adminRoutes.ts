import { Router } from 'express';

import { listPendingReviews, moderateReview } from '../controllers/adminReviewController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validateBody.js';
import { moderateReviewSchema } from '../validation/review.js';
import {
  listContactMessages,
  updateContactMessageStatus,
} from '../controllers/contactController.js';
import { updateContactMessageStatusSchema } from '../validation/contact.js';
import { getOverview } from '../controllers/adminOverviewController.js';
import {
  changeRoleHandler,
  enforceUserHandler,
  getAdminSession,
  getUserHandler,
  listAuditLogsHandler,
  listUsersHandler,
} from '../controllers/adminUserController.js';
import {
  cancelRequestHandler,
  createRequestHandler,
  decisionHandler,
  queueHandler,
  reviewDetailHandler,
} from '../controllers/artistVerificationController.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateQuery } from '../middleware/validateQuery.js';
import {
  cancelRequestSchema,
  createInfoRequestSchema,
  decisionSchema,
  queueQuerySchema,
} from '../validation/artistVerification.js';
import {
  auditLogQuerySchema,
  enforcementBodySchema,
  listUsersQuerySchema,
  staffRoleBodySchema,
} from '../validation/adminUsers.js';

export const adminRouter = Router();

adminRouter.get('/session', requirePermission('admin.access'), getAdminSession);
adminRouter.get('/overview', requirePermission('admin.access'), asyncHandler(getOverview));

// Users, enforcement, roles, audit log
adminRouter.get(
  '/users',
  requirePermission('users.view'),
  validateQuery(listUsersQuerySchema),
  asyncHandler(listUsersHandler),
);
adminRouter.get('/users/:id', requirePermission('users.view'), asyncHandler(getUserHandler));
adminRouter.post(
  '/users/:id/enforcement',
  requirePermission('users.enforce'),
  validateBody(enforcementBodySchema),
  asyncHandler(enforceUserHandler),
);
adminRouter.post(
  '/users/:id/roles',
  requirePermission('roles.manage'),
  validateBody(staffRoleBodySchema),
  asyncHandler(changeRoleHandler),
);
adminRouter.get(
  '/audit-logs',
  requirePermission('audit.view'),
  validateQuery(auditLogQuerySchema),
  asyncHandler(listAuditLogsHandler),
);

adminRouter.get('/reviews', requirePermission('reviews.moderate'), asyncHandler(listPendingReviews));
adminRouter.patch(
  '/reviews/:id',
  requirePermission('reviews.moderate'),
  validateBody(moderateReviewSchema),
  asyncHandler(moderateReview),
);
adminRouter.get('/contact-messages', requirePermission('support.manage'), asyncHandler(listContactMessages));
adminRouter.patch(
  '/contact-messages/:id',
  requirePermission('support.manage'),
  validateBody(updateContactMessageStatusSchema),
  asyncHandler(updateContactMessageStatus),
);

// Artist verification — every route needs `artists.review`.
adminRouter.get(
  '/artist-verification',
  requirePermission('artists.review'),
  validateQuery(queueQuerySchema),
  asyncHandler(queueHandler),
);
adminRouter.get(
  '/artist-verification/:artistId',
  requirePermission('artists.review'),
  asyncHandler(reviewDetailHandler),
);
adminRouter.post(
  '/artist-verification/:artistId/requests',
  requirePermission('artists.review'),
  validateBody(createInfoRequestSchema),
  asyncHandler(createRequestHandler),
);
adminRouter.post(
  '/artist-verification/requests/:requestId/cancel',
  requirePermission('artists.review'),
  validateBody(cancelRequestSchema),
  asyncHandler(cancelRequestHandler),
);
adminRouter.post(
  '/artist-verification/:artistId/decision',
  requirePermission('artists.review'),
  validateBody(decisionSchema),
  asyncHandler(decisionHandler),
);
