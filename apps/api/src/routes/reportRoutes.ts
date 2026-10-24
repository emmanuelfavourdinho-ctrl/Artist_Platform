import { Router } from 'express';
import { createReport } from '../controllers/reportController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validateBody.js';
import { createReportSchema } from '../validation/reports.js';

export const reportRouter = Router();

reportRouter.post('/', requireAuth, validateBody(createReportSchema), asyncHandler(createReport));
