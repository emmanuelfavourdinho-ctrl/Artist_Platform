import { Router } from 'express';
import { getUserOrders } from '../controllers/orderController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validateBody.js';
import {
  confirmBuyerReceipt,
  createDeliveryDispute,
  getBuyerOrderDelivery,
} from '../controllers/orderDeliveryController.js';
import {
  confirmReceiptSchema,
  createDeliveryDisputeSchema,
} from '../validation/orderDelivery.js';

export const orderRouter = Router();

orderRouter.use(requireAuth);
orderRouter.get('/', asyncHandler(getUserOrders));
orderRouter.get('/:orderId/delivery', asyncHandler(getBuyerOrderDelivery));
orderRouter.post(
  '/:orderId/confirm-receipt',
  validateBody(confirmReceiptSchema),
  asyncHandler(confirmBuyerReceipt),
);
orderRouter.post(
  '/:orderId/delivery-issues',
  validateBody(createDeliveryDisputeSchema),
  asyncHandler(createDeliveryDispute),
);

export default orderRouter;
