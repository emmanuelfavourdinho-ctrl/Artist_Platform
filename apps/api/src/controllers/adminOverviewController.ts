import type { NextFunction, Request, Response } from 'express';
import { getAdminOverview } from '../services/adminOverviewService.js';

// GET /api/v1/admin/overview — admin only (requireAdmin on the route).
export async function getOverview(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getAdminOverview();
    res.json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
}
