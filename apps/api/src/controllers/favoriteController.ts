import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

interface InventorySnapshot {
  quantity: number;
  reservedQuantity: number;
  soldQuantity: number;
}

// Same computation as artworkControllers.ts's isAvailable() — kept
// identical on purpose, so "available" never means two different things
// depending on which endpoint returned it.
function isAvailable(inventory: InventorySnapshot | null): boolean {
  if (!inventory) return false;
  return inventory.quantity - inventory.reservedQuantity - inventory.soldQuantity > 0;
}

export async function getFavorites(req: Request, res: Response, next: NextFunction) {
  try {
    // Safe to assert: requireAuth runs before this handler on every
    // route in favoriteRoutes.ts and guarantees req.user is set, or
    // the request never reaches here at all.
    const userId = req.user!.id;

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        artwork: {
          select: {
            id: true,
            slug: true,
            title: true,
            price: true,
            currency: true,
            images: {
              where: { isPrimary: true },
              take: 1,
              select: { url: true, altText: true, width: true, height: true },
            },
            artist: {
              select: { displayName: true, slug: true, verificationStatus: true },
            },
            inventory: {
              select: { quantity: true, reservedQuantity: true, soldQuantity: true },
            },
          },
        },
      },
    });

    // Shaped identically to the public artwork list endpoint's
    // ArtworkSummary — the frontend can reuse the exact same type and
    // card component for both "browse the gallery" and "your
    // favorites" instead of inventing a second, slightly different shape.
    const artworks = favorites.map(({ artwork }) => ({
      id: artwork.id,
      slug: artwork.slug,
      title: artwork.title,
      price: artwork.price,
      currency: artwork.currency,
      image: artwork.images[0] ?? null,
      artist: {
        name: artwork.artist.displayName,
        slug: artwork.artist.slug,
        verified: artwork.artist.verificationStatus === 'VERIFIED',
      },
      available: isAvailable(artwork.inventory),
    }));

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
): Promise<void> {
  try {
    const userId = req.user!.id;
    const { artworkId } = req.body as { artworkId?: string };

    if (!artworkId) {
      res.status(400).json({ success: false, error: 'artworkId is required' });
      return;
    }

    const existing = await prisma.favorite.findUnique({
      where: { userId_artworkId: { userId, artworkId } },
    });

    if (existing) {
      await prisma.favorite.delete({
        where: { userId_artworkId: { userId, artworkId } },
      });
      res.json({ success: true, isFavorited: false });
      return;
    }

    await prisma.favorite.create({ data: { userId, artworkId } });
    res.json({ success: true, isFavorited: true });
  } catch (err) {
    next(err);
  }
}
