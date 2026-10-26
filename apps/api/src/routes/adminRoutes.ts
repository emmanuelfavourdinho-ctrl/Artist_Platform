import { Router } from 'express';

import { listPendingReviews, moderateReview } from '../controllers/adminReviewController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validateBody.js';
import { moderateReviewSchema } from '../validation/review.js';
import {
  listContactMessages,
  updateContactMessageStatus,
} from '../controllers/contactController.js';
import {
  listContactMessagesQuerySchema,
  updateContactMessageStatusSchema,
} from '../validation/contact.js';
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
import {
  listArtworkQueueQuerySchema,
  moderateArtworkSchema,
} from '../validation/artworkModeration.js';
import {
  listPendingArtwork,
  moderateArtworkDecision,
  pendingArtworkDetail,
} from '../controllers/adminArtworkController.js';
import { decideReport, getReportDetail, listReports } from '../controllers/reportController.js';
import { listReportsQuerySchema, updateReportSchema } from '../validation/reports.js';
import {
  getAdminOrder,
  getAdminPayment,
  listAdminOrders,
  listAdminPayments,
} from '../controllers/adminFinanceController.js';
import {
  listAdminOrdersQuerySchema,
  listAdminPaymentsQuerySchema,
  listAdminFinancialActivitiesQuerySchema,
} from '../validation/adminFinance.js';
import { listAdminFinancialActivities } from '../controllers/adminFinancialActivityController.js';
import {
  getAdminDeliveryDispute,
  resolveDeliveryDispute,
  setOrderReleaseHold,
} from '../controllers/orderDeliveryController.js';
import {
  releaseHoldSchema,
  resolveDeliveryDisputeSchema,
} from '../validation/orderDelivery.js';
import {
  createAdminPayout,
  createAdminRefund,
  decideAdminPayout,
  decideAdminRefund,
  getAdminPayout,
  getAdminRefund,
  listAdminEligiblePayouts,
  listAdminPayouts,
  listAdminRefunds,
  reconcileAdminPayout,
  reconcileAdminRefund,
  retryAdminPayout,
  retryAdminRefund,
  submitAdminPayout,
  submitAdminRefund,
} from '../controllers/adminRefundPayoutController.js';
import {
  createArtistPayoutSchema,
  createRefundSchema,
  decideFinancialOperationSchema,
  eligiblePayoutsQuerySchema,
  listPayoutsQuerySchema,
  listRefundsQuerySchema,
  retryFinancialOperationSchema,
} from '../validation/refundPayout.js';

export const adminRouter = Router();

adminRouter.get('/session', requirePermission('admin.access'), getAdminSession);
adminRouter.get('/overview', requirePermission('admin.access'), asyncHandler(getOverview));

// Read-only order and payment inspection for Finance Admins and Admins.
adminRouter.get(
  '/financial-activities',
  requirePermission('finance.view'),
  validateQuery(listAdminFinancialActivitiesQuerySchema),
  asyncHandler(listAdminFinancialActivities),
);
adminRouter.get(
  '/orders',
  requirePermission('finance.view'),
  validateQuery(listAdminOrdersQuerySchema),
  asyncHandler(listAdminOrders),
);
adminRouter.get('/orders/:id', requirePermission('finance.view'), asyncHandler(getAdminOrder));
adminRouter.get(
  '/payments',
  requirePermission('finance.view'),
  validateQuery(listAdminPaymentsQuerySchema),
  asyncHandler(listAdminPayments),
);
adminRouter.get('/payments/:id', requirePermission('finance.view'), asyncHandler(getAdminPayment));
adminRouter.get(
  '/delivery-disputes/:disputeId',
  requirePermission('reports.manage'),
  asyncHandler(getAdminDeliveryDispute),
);
adminRouter.post(
  '/delivery-disputes/:disputeId/decision',
  requirePermission('reports.manage'),
  validateBody(resolveDeliveryDisputeSchema),
  asyncHandler(resolveDeliveryDispute),
);
adminRouter.patch(
  '/orders/:orderId/release-hold',
  requirePermission('reports.manage'),
  validateBody(releaseHoldSchema),
  asyncHandler(setOrderReleaseHold),
);
adminRouter.get(
  '/refunds',
  requirePermission('finance.view'),
  validateQuery(listRefundsQuerySchema),
  asyncHandler(listAdminRefunds),
);
adminRouter.get('/refunds/:id', requirePermission('finance.view'), asyncHandler(getAdminRefund));
adminRouter.post(
  '/refunds',
  requirePermission('finance.refunds.manage'),
  validateBody(createRefundSchema),
  asyncHandler(createAdminRefund),
);
adminRouter.patch(
  '/refunds/:id/decision',
  requirePermission('finance.refunds.manage'),
  validateBody(decideFinancialOperationSchema),
  asyncHandler(decideAdminRefund),
);
adminRouter.post(
  '/refunds/:id/retry',
  requirePermission('finance.refunds.manage'),
  validateBody(retryFinancialOperationSchema),
  asyncHandler(retryAdminRefund),
);
adminRouter.post(
  '/refunds/:id/submit',
  requirePermission('finance.refunds.manage'),
  asyncHandler(submitAdminRefund),
);
adminRouter.post(
  '/refunds/:id/reconcile',
  requirePermission('finance.refunds.manage'),
  asyncHandler(reconcileAdminRefund),
);
adminRouter.get(
  '/payouts/eligible',
  requirePermission('finance.view'),
  validateQuery(eligiblePayoutsQuerySchema),
  asyncHandler(listAdminEligiblePayouts),
);
adminRouter.get(
  '/payouts',
  requirePermission('finance.view'),
  validateQuery(listPayoutsQuerySchema),
  asyncHandler(listAdminPayouts),
);
adminRouter.get('/payouts/:id', requirePermission('finance.view'), asyncHandler(getAdminPayout));
adminRouter.post(
  '/payouts',
  requirePermission('finance.payouts.manage'),
  validateBody(createArtistPayoutSchema),
  asyncHandler(createAdminPayout),
);
adminRouter.patch(
  '/payouts/:id/decision',
  requirePermission('finance.payouts.manage'),
  validateBody(decideFinancialOperationSchema),
  asyncHandler(decideAdminPayout),
);
adminRouter.post(
  '/payouts/:id/retry',
  requirePermission('finance.payouts.manage'),
  validateBody(retryFinancialOperationSchema),
  asyncHandler(retryAdminPayout),
);
adminRouter.post(
  '/payouts/:id/submit',
  requirePermission('finance.payouts.manage'),
  asyncHandler(submitAdminPayout),
);
adminRouter.post(
  '/payouts/:id/reconcile',
  requirePermission('finance.payouts.manage'),
  asyncHandler(reconcileAdminPayout),
);

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

adminRouter.get(
  '/reviews',
  requirePermission('reviews.moderate'),
  asyncHandler(listPendingReviews),
);
adminRouter.patch(
  '/reviews/:id',
  requirePermission('reviews.moderate'),
  validateBody(moderateReviewSchema),
  asyncHandler(moderateReview),
);
adminRouter.get(
  '/artworks',
  requirePermission('artworks.moderate'),
  validateQuery(listArtworkQueueQuerySchema),
  asyncHandler(listPendingArtwork),
);
adminRouter.get(
  '/artworks/:id',
  requirePermission('artworks.moderate'),
  asyncHandler(pendingArtworkDetail),
);
adminRouter.patch(
  '/artworks/:id',
  requirePermission('artworks.moderate'),
  validateBody(moderateArtworkSchema),
  asyncHandler(moderateArtworkDecision),
);
adminRouter.get(
  '/reports',
  requirePermission('reports.manage'),
  validateQuery(listReportsQuerySchema),
  asyncHandler(listReports),
);
adminRouter.get('/reports/:id', requirePermission('reports.manage'), asyncHandler(getReportDetail));
adminRouter.patch(
  '/reports/:id',
  requirePermission('reports.manage'),
  validateBody(updateReportSchema),
  asyncHandler(decideReport),
);
adminRouter.get(
  '/contact-messages',
  requirePermission('support.manage'),
  validateQuery(listContactMessagesQuerySchema),
  asyncHandler(listContactMessages),
);
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
