import { Router } from 'express';
import { healthRouter } from './health.js';
import { reviewsRouter } from './review.js';
import { adminRouter } from './adminRoutes.js';
import { authRouter } from './authRoutes.js';

const router = Router();
router.use('/health', healthRouter);
router.use('/artworks', reviewsRouter);
router.use('/admin', adminRouter);
router.use('/auth', authRouter);
router.use('/artists', artistsRouter);

export { router };
