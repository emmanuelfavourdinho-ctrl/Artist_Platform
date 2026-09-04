import { Router } from 'express';
import { syncUser } from '../controllers/authController.js';
import { authRateLimiter } from '../middleware/authRateLimiter.js';

export const authRouter = Router();

authRouter.post('/sync', authRateLimiter, syncUser);

export default authRouter;
