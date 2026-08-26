import { Router } from 'express';
import { register, login, logout } from '../controllers/authController.js';
import { validateBody } from '../middleware/validateBody.js';
import { authRateLimiter } from '../middleware/authRateLimiter.js';
import { registerSchema, loginSchema } from '../schemas/authSchemas.js';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, validateBody(registerSchema), register);
authRouter.post('/login', authRateLimiter, validateBody(loginSchema), login);
authRouter.post('/logout', logout);
