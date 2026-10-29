import type { NextFunction, Request, Response } from 'express';
import { getAnalyticsDashboard as buildDashboard } from '../services/analyticsService.js';
import type { AnalyticsQuery } from '../validation/analytics.js';

/*
  Explainer: GET /api/v1/analytics/dashboard — admin only (enforced at the
  router level in analyticsRoutes.ts). `req.query` has already been
  validated and defaulted by validateQuery(analyticsQuerySchema), so the
  cast below is safe; there is deliberately no second, looser parse here.
*/
export async function getAnalyticsDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const { range, limit } = req.query as unknown as AnalyticsQuery;
    const data = await buildDashboard(range, limit);
    res.json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
}
