import { Router } from 'express';
import { getNotifications, markAsRead } from '../controllers/notificationController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validateBody.js';
import { markNotificationsReadSchema } from '../validation/artistVerification.js';

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get('/', asyncHandler(getNotifications));
notificationRouter.patch('/read', validateBody(markNotificationsReadSchema), asyncHandler(markAsRead));

export default notificationRouter;
