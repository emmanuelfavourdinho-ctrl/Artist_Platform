import { Router } from 'express';
import { getAuctionDetails } from '../controllers/auctionController.js';

export const auctionRouter = Router();

auctionRouter.get('/:id', getAuctionDetails);

export default auctionRouter;
