import { Router } from 'express';
import {
  getStudioArtworks,
  createStudioArtwork,
  getCloudinaryUploadSignature,
} from '../controllers/studioController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireArtist } from '../middleware/requireArtist.js';

export const studioRouter = Router();

studioRouter.use(requireAuth);
studioRouter.use(requireArtist);

studioRouter.get('/artworks', getStudioArtworks);
studioRouter.post('/artworks', createStudioArtwork);
studioRouter.get('/uploads/cloudinary-signature', getCloudinaryUploadSignature);

export default studioRouter;
