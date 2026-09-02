import { Router } from 'express';
import { getAnalyticsDashboard } from '../controllers/analyticsController.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

analyticsRouter.get('/dashboard', getAnalyticsDashboard);

export default analyticsRouter;
