import { Router } from 'express';
import { getUserOrders } from '../controllers/orderController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const orderRouter = Router();

orderRouter.use(requireAuth);
orderRouter.get('/', asyncHandler(getUserOrders));

export default orderRouter;
