import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

export async function getUserOrders(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;

    const orders = await prisma.order.findMany({
      where: { userId },
      include: { items: true, shipment: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ status: 'success', data: orders });
  } catch (err) {
    next(err);
  }
}
