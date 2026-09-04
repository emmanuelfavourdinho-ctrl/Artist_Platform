import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { prisma } from '../config/db.js';
import { config } from '../config/index.js';
import { HttpError } from '../lib/httpError.js';
import { createArtworkSchema, updateArtistProfileSchema } from '../schemas/studioSchemas.js';

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
    const userId = req.user?.id;
    if (!userId) throw new Error('Authenticated user is required');

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
      include: { images: { where: { isPrimary: true }, take: 1 } },
    });

    res.json({
      success: true,
      data: {
        artworks: artworks.map((artwork) => ({
          ...artwork,
          imageUrl: artwork.images[0]?.url ?? '',
        })),
        artist,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createStudioArtwork(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('Authenticated user is required');
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

    const folder = `artists/${userId}/artworks/`;
    const images = body.images.map((image, position) => {
      const secureUrl = new URL(image.secureUrl);
      if (
        !image.publicId.startsWith(folder) ||
        secureUrl.protocol !== 'https:' ||
        secureUrl.hostname !== 'res.cloudinary.com' ||
        secureUrl.pathname.split('/')[1] !== config.cloudinary.cloudName
      ) {
        throw new HttpError(400, 'Invalid Cloudinary asset ownership', {
          code: 'INVALID_CLOUDINARY_ASSET',
        });
      }
      return {
        url: image.secureUrl,
        publicId: image.publicId,
        secureUrl: image.secureUrl,
        resourceType: image.resourceType,
        format: image.format,
        width: image.width,
        height: image.height,
        bytes: image.bytes,
        altText: image.altText,
        position,
        isPrimary: position === 0,
      };
    });

    const artwork = await prisma.artwork.create({
      data: {
        title: body.title,
        description: body.description,
        price: body.price,
        currency: body.currency,
        slug: slugify(body.title),
        artistId: artist.id,
        images: { create: images },
      },
    });

    res.status(201).json({ success: true, data: artwork });
  } catch (err) {
    next(err);
  }
}

export function getCloudinaryUploadSignature(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    const { cloudName, apiKey, apiSecret } = config.cloudinary;
    if (!userId || !cloudName || !apiKey || !apiSecret) {
      res.status(503).json({ status: 'error', message: 'Image uploads are not configured' });
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `artists/${userId}/artworks`;
    const signature = createHash('sha1')
      .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
      .digest('hex');

    res.json({ status: 'success', data: { timestamp, signature, apiKey, cloudName, folder } });
  } catch (err) {
    next(err);
  }
}

export async function updateArtistProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('Authenticated user is required');
    const body = updateArtistProfileSchema.parse(req.body);

    const existingProfile = await prisma.artistProfile.findUnique({ where: { userId } });
    const profile = existingProfile
      ? await prisma.artistProfile.update({
          where: { userId },
          data: body,
          select: { displayName: true, biography: true, slug: true, location: true },
        })
      : await prisma.artistProfile.create({
          data: {
            userId,
            ...body,
            slug: `${body.displayName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')}-${userId.slice(0, 8)}`,
          },
          select: { displayName: true, biography: true, slug: true, location: true },
        });

    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}
