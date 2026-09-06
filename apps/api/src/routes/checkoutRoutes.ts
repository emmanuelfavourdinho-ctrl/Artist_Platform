import { Router } from 'express';
import { createCheckoutSession } from '../controllers/checkoutController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const checkoutRouter = Router();

checkoutRouter.use(requireAuth);
checkoutRouter.post('/session', asyncHandler(createCheckoutSession));

export default checkoutRouter;
