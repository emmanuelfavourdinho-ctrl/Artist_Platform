import { Router } from 'express';
import { createCommunityPost, listCommunityPosts } from '../controllers/communityController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireGoodStanding } from '../middleware/requireGoodStanding.js';
import { requireArtist } from '../middleware/requireArtist.js';

export const communityRouter = Router();
communityRouter.get('/', asyncHandler(listCommunityPosts));
communityRouter.post('/', requireAuth, requireGoodStanding, requireArtist, asyncHandler(createCommunityPost));

export default communityRouter;
