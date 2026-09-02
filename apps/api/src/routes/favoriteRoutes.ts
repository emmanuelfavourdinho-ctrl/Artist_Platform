import { Router } from 'express';
import { getFavorites, toggleFavorite } from '../controllers/favoriteController.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const favoriteRouter = Router();

favoriteRouter.use(requireAuth); // Protect all favorite routes

favoriteRouter.get('/', getFavorites);
favoriteRouter.post('/toggle', toggleFavorite);

export default favoriteRouter;
