import { Router } from 'express';

import { getArtistBySlug } from '../controllers/artistControllers.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const artistsRouter = Router();

artistsRouter.get('/:slug', asyncHandler(getArtistBySlug));
