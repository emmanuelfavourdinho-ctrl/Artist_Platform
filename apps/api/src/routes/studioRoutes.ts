import { Router } from 'express';
import {
  getStudioArtworks,
  createStudioArtwork,
  getCloudinaryUploadSignature,
  updateArtistProfile,
} from '../controllers/studioController.js';
import {
  ownRequestHandler,
  ownVerificationHandler,
  submitResponseHandler,
} from '../controllers/artistVerificationController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validateBody.js';
import { submitResponseSchema } from '../validation/artistVerification.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireGoodStanding } from '../middleware/requireGoodStanding.js';
import { requireArtist } from '../middleware/requireArtist.js';

export const studioRouter = Router();

studioRouter.use(requireAuth);
studioRouter.use(requireArtist);

studioRouter.get('/artworks', getStudioArtworks);
studioRouter.post('/artworks', requireGoodStanding, createStudioArtwork);
studioRouter.get('/uploads/cloudinary-signature', getCloudinaryUploadSignature);
studioRouter.patch('/profile', updateArtistProfile);

// Verification tasks. The artist is always the signed-in user; request ids
// are checked against that ownership in the service.
studioRouter.get('/verification', asyncHandler(ownVerificationHandler));
studioRouter.get('/verification/requests/:id', asyncHandler(ownRequestHandler));
studioRouter.post(
  '/verification/requests/:id/submission',
  validateBody(submitResponseSchema),
  asyncHandler(submitResponseHandler),
);

export default studioRouter;
