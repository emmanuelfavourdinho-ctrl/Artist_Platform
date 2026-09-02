import { Router } from 'express';
import { register, login, logout } from '../controllers/authController.js';
import { validateBody } from '../middleware/validateBody.js';
import { authRateLimiter } from '../middleware/authRateLimiter.js';
import { registerSchema, loginSchema } from '../schemas/authSchemas.js';

export const authRouter = Router();

/* ------------------------------------------------------------------ */
/* Auth Endpoints (/api/v1/auth)                                      */
/* ------------------------------------------------------------------ */

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user account
 * @access  Public
 */
authRouter.post('/register', authRateLimiter, validateBody(registerSchema), register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user and issue session/token
 * @access  Public
 */
authRouter.post('/login', authRateLimiter, validateBody(loginSchema), login);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Clear auth cookie/token session
 * @access  Public / Protected
 */
authRouter.post('/logout', logout);

export default authRouter;
