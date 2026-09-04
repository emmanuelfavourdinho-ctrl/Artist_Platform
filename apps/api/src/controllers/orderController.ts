import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';

export async function createPaymentIntent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const _userId = (req as any).user?.id;
    const { amount: _amount, currency: _currency = 'usd' } = req.body;

    // TODO: Connect your Stripe/payment gateway logic here
    return res.json({
      success: true,
      clientSecret: 'mock_payment_intent_secret',
    });
  } catch (error) {
    return next(error);
  }
}

export async function getUserOrders(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const userId = (req as any).user?.id;

    const orders = await prisma.order.findMany({
      where: { userId },
      include: {
        items: true,
        shipment: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(orders);
  } catch (error) {
    return next(error);
  }
}
