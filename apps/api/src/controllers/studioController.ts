import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { createArtworkSchema } from '../schemas/studioSchemas.js';

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\w ]+/g, '')
      .replace(/ +/g, '-') +
    '-' +
    Date.now().toString().slice(-4)
  );
}

export async function getStudioArtworks(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user.id;

    let artist = await prisma.artistProfile.findUnique({
      where: { userId },
    });

    if (!artist) {
      artist = await prisma.artistProfile.create({
        data: {
          userId,
          displayName: 'New Artist',
          slug: `artist-${Date.now()}`,
        },
      });
    }

    const artworks = await prisma.artwork.findMany({
      where: { artistId: artist.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: { artworks, artist } });
  } catch (err) {
    next(err);
  }
}

export async function createStudioArtwork(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user.id;
    const body = createArtworkSchema.parse(req.body);

    let artist = await prisma.artistProfile.findUnique({
      where: { userId },
    });

    if (!artist) {
      artist = await prisma.artistProfile.create({
        data: {
          userId,
          displayName: 'New Artist',
          slug: `artist-${Date.now()}`,
        },
      });
    }

    const artwork = await prisma.artwork.create({
      data: {
        ...body,
        slug: slugify(body.title),
        artistId: artist.id,
      },
    });

    res.status(201).json({ success: true, data: artwork });
  } catch (err) {
    next(err);
  }
}
