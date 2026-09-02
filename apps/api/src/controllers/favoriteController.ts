import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';

export async function getFavorites(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user.id;

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        artwork: true,
      },
    });

    const artworks = favorites.map((f) => f.artwork);

    res.json({
      success: true,
      data: { artworks, total: artworks.length },
    });
  } catch (err) {
    next(err);
  }
}

export async function toggleFavorite(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> {
  try {
    const userId = (req as any).user.id;
    const { artworkId } = req.body;

    if (!artworkId) {
      return res.status(400).json({ success: false, error: 'artworkId is required' });
    }

    const existing = await prisma.favorite.findUnique({
      where: { userId_artworkId: { userId, artworkId } },
    });

    if (existing) {
      await prisma.favorite.delete({
        where: { userId_artworkId: { userId, artworkId } },
      });
      return res.json({ success: true, isFavorited: false });
    }

    await prisma.favorite.create({
      data: { userId, artworkId },
    });

    return res.json({ success: true, isFavorited: true });
  } catch (err) {
    return next(err);
  }
}
