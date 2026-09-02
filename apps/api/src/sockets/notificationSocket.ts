import { prisma } from '../config/db.js';

export async function sendNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  link?: string,
) {
  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      data: link ? { link } : {},
    },
  });

  return {
    id: notification.id,
    userId: notification.userId,
    title: notification.title,
    message: notification.message,
    data: notification.data,
    read: notification.readAt !== null,
    createdAt: notification.createdAt,
  };
}
