import { Router } from 'express';
import { createPaymentIntent, getUserOrders } from '../controllers/orderController.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const orderRouter = Router();

orderRouter.use(requireAuth);

orderRouter.get('/', getUserOrders);
orderRouter.post('/create-payment-intent', createPaymentIntent);

export default orderRouter;
