import { Router } from 'express';
import { syncUser } from '../controllers/authController.js';
import { authRateLimiter } from '../middleware/authRateLimiter.js';

export const authRouter = Router();

/**
 * POST /auth/sync
 * Called right after Firebase login/signup succeeds on the frontend.
 * Verifies the Firebase ID token, finds-or-creates the matching
 * PostgreSQL User, and returns role/account info for routing.
 * Idempotent — safe to call on every page load.
 */
authRouter.post('/sync', authRateLimiter, syncUser);

export default authRouter;
