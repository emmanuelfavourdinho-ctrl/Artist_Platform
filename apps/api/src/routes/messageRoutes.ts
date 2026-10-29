import { Router } from 'express';
import {
  createConversation,
  createMessageUploadSignature,
  deleteMessage,
  downloadMessageAttachment,
  editMessage,
  getConversation,
  listConversations,
  pinMessage,
  reportConversationParticipant,
  sendMessage,
} from '../controllers/messageController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireGoodStanding } from '../middleware/requireGoodStanding.js';

export const messageRouter = Router();
messageRouter.use(requireAuth);
messageRouter.get('/', asyncHandler(listConversations));
messageRouter.post('/', requireGoodStanding, asyncHandler(createConversation));
messageRouter.post('/:id/uploads/signature', requireGoodStanding, asyncHandler(createMessageUploadSignature));
messageRouter.get('/:id/attachments/:messageId', asyncHandler(downloadMessageAttachment));
messageRouter.post('/:id/report', asyncHandler(reportConversationParticipant));
messageRouter.get('/:id', asyncHandler(getConversation));
messageRouter.post('/:id/messages', requireGoodStanding, asyncHandler(sendMessage));
messageRouter.patch('/:id/messages/:messageId', requireGoodStanding, asyncHandler(editMessage));
messageRouter.delete('/:id/messages/:messageId', requireGoodStanding, asyncHandler(deleteMessage));
messageRouter.patch('/:id/messages/:messageId/pin', requireGoodStanding, asyncHandler(pinMessage));

export default messageRouter;
