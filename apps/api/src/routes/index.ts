import { Router } from 'express';
import { healthRouter } from './health.js';
import { reviewsRouter } from './review.js';
import { adminRouter } from './adminRoutes.js';
import { authRouter } from './authRoutes.js';
import { artistsRouter } from './artist.js';
import { artworksRouter } from './artworkRoutes.js';
import studioRouter from './studioRoutes.js';

const router = Router();
router.use('/health', healthRouter);
router.use('/artworks', artworksRouter);
router.use('/artworks', reviewsRouter);
router.use('/reviews', reviewsRouter);
router.use('/admin', adminRouter);
router.use('/auth', authRouter);
router.use('/artists', artistsRouter);
router.use('/studio', studioRouter);

export { router };
