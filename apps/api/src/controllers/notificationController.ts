import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';

export async function getNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user.id;

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    res.json({
      success: true,
      data: { notifications, unreadCount },
    });
  } catch (err) {
    next(err);
  }
}

export async function markAsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user.id;
    const { notificationIds } = req.body;

    if (Array.isArray(notificationIds) && notificationIds.length > 0) {
      await prisma.notification.updateMany({
        where: { id: { in: notificationIds }, userId },
        data: { readAt: new Date() },
      });
    } else {
      await prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
