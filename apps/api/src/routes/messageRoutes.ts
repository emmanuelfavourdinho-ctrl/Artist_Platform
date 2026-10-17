import { Router } from 'express';
import {
  createConversation,
  getConversation,
  listConversations,
  sendMessage,
} from '../controllers/messageController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireGoodStanding } from '../middleware/requireGoodStanding.js';

export const messageRouter = Router();
messageRouter.use(requireAuth);
messageRouter.get('/', asyncHandler(listConversations));
messageRouter.post('/', requireGoodStanding, asyncHandler(createConversation));
messageRouter.get('/:id', asyncHandler(getConversation));
messageRouter.post('/:id/messages', requireGoodStanding, asyncHandler(sendMessage));

export default messageRouter;
