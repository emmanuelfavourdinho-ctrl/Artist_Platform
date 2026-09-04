import { Router } from 'express';
import { getCommissionUploadSignature } from '../controllers/mediaController.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const mediaRouter = Router();
mediaRouter.get('/commissions/signature', requireAuth, getCommissionUploadSignature);

export default mediaRouter;
