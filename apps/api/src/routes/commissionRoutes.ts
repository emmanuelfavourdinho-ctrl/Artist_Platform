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

export const commissionRouter = Router();
commissionRouter.use(requireAuth);
commissionRouter.get('/', asyncHandler(listMyCommissions));
commissionRouter.post('/', asyncHandler(createCommission));
commissionRouter.get('/:id', asyncHandler(getCommission));
commissionRouter.patch('/:id/status', asyncHandler(updateCommissionStatus));
commissionRouter.post('/:id/proposal', asyncHandler(createProposal));
commissionRouter.post('/:id/proposal/decision', asyncHandler(decideProposal));

export default commissionRouter;
