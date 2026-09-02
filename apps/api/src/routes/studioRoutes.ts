import { Router } from 'express';
import { getStudioArtworks, createStudioArtwork } from '../controllers/studioController.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const studioRouter = Router();

studioRouter.use(requireAuth);

studioRouter.get('/artworks', getStudioArtworks);
studioRouter.post('/artworks', createStudioArtwork);

export default studioRouter;
