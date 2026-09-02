import { Router } from 'express';
import { searchArtworks, suggestArtworks } from '../controllers/searchController.js';

export const searchRouter = Router();

searchRouter.get('/', searchArtworks);
searchRouter.get('/suggest', suggestArtworks);

export default searchRouter;
