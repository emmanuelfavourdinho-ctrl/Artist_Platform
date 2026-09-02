import { Request, Response, NextFunction } from 'express';
import {
  getOverviewMetrics,
  getSalesTimeSeries,
  getTopPerformingArtworks,
} from '../services/analyticsService.js';

export async function getAnalyticsDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const days = req.query.days ? Number(req.query.days) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 5;

    const [overview, timeSeries, topArtworks] = await Promise.all([
      getOverviewMetrics(),
      getSalesTimeSeries(days),
      getTopPerformingArtworks(limit),
    ]);

    return res.json({
      success: true,
      data: {
        overview,
        timeSeries,
        topArtworks,
      },
    });
  } catch (error) {
    return next(error);
  }
}
