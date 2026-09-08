import { Router } from 'express';
import { createContactMessage, recordEmailOutcome } from '../controllers/contactController.js';
import { contactRateLimiter } from '../middleware/contactRateLimiter.js';
import { validateBody } from '../middleware/validateBody.js';
import { createContactMessageSchema, recordEmailOutcomeSchema } from '../validation/contact.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const contactRouter = Router();

contactRouter.post(
  '/',
  contactRateLimiter,
  validateBody(createContactMessageSchema),
  asyncHandler(createContactMessage),
);

contactRouter.patch(
  '/:id/email-status',
  contactRateLimiter,
  validateBody(recordEmailOutcomeSchema),
  asyncHandler(recordEmailOutcome),
);

export default contactRouter;
