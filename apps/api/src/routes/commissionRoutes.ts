import { Router } from 'express';
import {
  createCommission,
  createProposal,
  decideProposal,
  getCommission,
  listMyCommissions,
  updateCommissionStatus,
} from '../controllers/commissionController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireGoodStanding } from '../middleware/requireGoodStanding.js';

export const commissionRouter = Router();
commissionRouter.use(requireAuth);
commissionRouter.get('/', asyncHandler(listMyCommissions));
commissionRouter.post('/', requireGoodStanding, asyncHandler(createCommission));
commissionRouter.get('/:id', asyncHandler(getCommission));
commissionRouter.patch('/:id/status', requireGoodStanding, asyncHandler(updateCommissionStatus));
commissionRouter.post('/:id/proposal', requireGoodStanding, asyncHandler(createProposal));
commissionRouter.post('/:id/proposal/decision', requireGoodStanding, asyncHandler(decideProposal));

export default commissionRouter;
