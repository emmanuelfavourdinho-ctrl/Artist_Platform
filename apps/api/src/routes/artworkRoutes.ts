import { Router } from 'express';

import { getArtworkBySlug, listArtworks } from '../controllers/artworkControllers.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateQuery } from '../middleware/validateQuery.js';
import { listArtworksQuerySchema } from '../validation/artwork.js';

export const artworksRouter = Router();

artworksRouter.get('/', validateQuery(listArtworksQuerySchema), asyncHandler(listArtworks));
artworksRouter.get('/:slug', asyncHandler(getArtworkBySlug));

export default artworksRouter;
