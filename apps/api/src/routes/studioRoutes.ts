import { Router } from 'express';
import {
  getStudioArtworks,
  getStudioArtistProfile,
  createStudioArtwork,
  updateStudioArtwork,
  submitStudioArtwork,
  publishStudioArtwork,
  archiveStudioArtwork,
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
import { getStudioEarnings } from '../controllers/studioFinanceController.js';
import {
  confirmArtistCompletion,
  correctArtistTracking,
  getArtistOrderFulfillment,
  listArtistOrderFulfillments,
  listArtistDeliveryDisputes,
  respondToArtistDeliveryDispute,
  shipArtistOrder,
} from '../controllers/orderDeliveryController.js';
import {
  artistDisputeResponseSchema,
  shipOrderSchema,
  updateTrackingSchema,
} from '../validation/orderDelivery.js';

export const studioRouter = Router();

studioRouter.use(requireAuth);
studioRouter.use(requireArtist);

studioRouter.get('/artworks', getStudioArtworks);
studioRouter.get('/profile', asyncHandler(getStudioArtistProfile));
studioRouter.post('/artworks', requireGoodStanding, createStudioArtwork);
studioRouter.patch('/artworks/:id', requireGoodStanding, updateStudioArtwork);
studioRouter.post('/artworks/:id/submit', requireGoodStanding, asyncHandler(submitStudioArtwork));
studioRouter.post('/artworks/:id/publish', requireGoodStanding, asyncHandler(publishStudioArtwork));
studioRouter.post('/artworks/:id/archive', asyncHandler(archiveStudioArtwork));
studioRouter.get('/uploads/cloudinary-signature', requireGoodStanding, getCloudinaryUploadSignature);
studioRouter.patch('/profile', requireGoodStanding, updateArtistProfile);
studioRouter.get('/orders', asyncHandler(listArtistOrderFulfillments));
studioRouter.get('/earnings', asyncHandler(getStudioEarnings));
studioRouter.get('/disputes', asyncHandler(listArtistDeliveryDisputes));
studioRouter.post(
  '/disputes/:disputeId/response',
  validateBody(artistDisputeResponseSchema),
  asyncHandler(respondToArtistDeliveryDispute),
);
studioRouter.get('/orders/:orderId/fulfillment', asyncHandler(getArtistOrderFulfillment));
studioRouter.post(
  '/orders/:orderId/shipments',
  validateBody(shipOrderSchema),
  asyncHandler(shipArtistOrder),
);
studioRouter.patch(
  '/orders/:orderId/shipments/tracking',
  validateBody(updateTrackingSchema),
  asyncHandler(correctArtistTracking),
);
studioRouter.post(
  '/orders/:orderId/confirm-completion',
  asyncHandler(confirmArtistCompletion),
);

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
