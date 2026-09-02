import { Router } from 'express';
import { getNotifications, markAsRead } from '../controllers/notificationController.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get('/', getNotifications);
notificationRouter.patch('/read', markAsRead);

export default notificationRouter;
