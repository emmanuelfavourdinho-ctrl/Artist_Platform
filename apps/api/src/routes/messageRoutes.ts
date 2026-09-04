import { Router } from 'express';
import {
  createConversation,
  getConversation,
  listConversations,
  sendMessage,
} from '../controllers/messageController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const messageRouter = Router();
messageRouter.use(requireAuth);
messageRouter.get('/', asyncHandler(listConversations));
messageRouter.post('/', asyncHandler(createConversation));
messageRouter.get('/:id', asyncHandler(getConversation));
messageRouter.post('/:id/messages', asyncHandler(sendMessage));

export default messageRouter;
