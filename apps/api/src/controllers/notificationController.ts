import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { isSafeLink } from '../services/notificationService.js';
import type { MarkNotificationsReadInput } from '../validation/artistVerification.js';

function userId(req: Request): string {
  if (!req.user) throw new HttpError(401, 'Login required', { code: 'AUTH_REQUIRED' });
  return req.user.id;
}

/*
  Explainer: the response contract the UI relies on. The task link is read
  out of data.link (where notificationService stores it) and returned as a
  top-level `link`, but only if it is a safe app-relative path — a bad
  value in the database can never become a navigable off-site URL.
  `read` is derived from readAt so the UI has one consistent field.
*/
export async function getNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const id = userId(req);
    const [rows, unreadCount] = await Promise.all([
      // Always scoped to the authenticated recipient.
      prisma.notification.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, type: true, title: true, message: true, data: true, readAt: true, createdAt: true },
      }),
      prisma.notification.count({ where: { userId: id, readAt: null } }),
    ]);

    const notifications = rows.map(({ data, readAt, ...rest }) => {
      const link =
        data && typeof data === 'object' && !Array.isArray(data) && typeof data.link === 'string'
          ? data.link
          : null;
      return { ...rest, link: link && isSafeLink(link) ? link : null, read: readAt !== null };
    });

    res.json({ status: 'success', data: { notifications, unreadCount } });
  } catch (error) {
    next(error);
  }
}

export async function markAsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const id = userId(req);
    const { notificationIds } = req.body as MarkNotificationsReadInput;

    // `userId` in the filter means another user's ids are silently ignored.
    const result = await prisma.notification.updateMany({
      where: {
        userId: id,
        readAt: null,
        ...(notificationIds ? { id: { in: notificationIds } } : {}),
      },
      data: { readAt: new Date() },
    });

    res.json({ status: 'success', data: { updated: result.count } });
  } catch (error) {
    next(error);
  }
}
