import { Router } from 'express';
import { getMe, updateMe } from '../controllers/userController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validateBody.js';
import { updateProfileSchema } from '../validation/user.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.get('/me', asyncHandler(getMe));
usersRouter.patch('/me', validateBody(updateProfileSchema), asyncHandler(updateMe));

export default usersRouter;
