import { Router } from 'express';
import { healthRouter } from './health.js';
import { reviewsRouter } from './review.js';
import { adminRouter } from './adminRoutes.js';
import { authRouter } from './authRoutes.js';
import { artistsRouter } from './artist.js';
import { artworksRouter } from './artworkRoutes.js';
import studioRouter from './studioRoutes.js';
import commissionRouter from './commissionRoutes.js';
import communityRouter from './communityRoutes.js';
import messageRouter from './messageRoutes.js';
import mediaRouter from './mediaRoutes.js';

const router = Router();
router.use('/health', healthRouter);
router.use('/artworks', artworksRouter);
router.use('/artworks', reviewsRouter);
router.use('/reviews', reviewsRouter);
router.use('/admin', adminRouter);
router.use('/auth', authRouter);
router.use('/artists', artistsRouter);
router.use('/studio', studioRouter);
router.use('/commissions', commissionRouter);
router.use('/community', communityRouter);
router.use('/messages', messageRouter);
router.use('/media', mediaRouter);

export { router };
