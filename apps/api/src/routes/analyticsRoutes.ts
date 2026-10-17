import { Router } from 'express';
import { getAnalyticsDashboard } from '../controllers/analyticsController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateQuery } from '../middleware/validateQuery.js';
import { analyticsQuerySchema } from '../validation/analytics.js';

export const analyticsRouter = Router();

// Router-level, so any analytics route added later is admin-only by
// default instead of depending on someone remembering to add the guard.
analyticsRouter.use(requirePermission('finance.view'));

analyticsRouter.get(
  '/dashboard',
  validateQuery(analyticsQuerySchema),
  asyncHandler(getAnalyticsDashboard),
);

export default analyticsRouter;
