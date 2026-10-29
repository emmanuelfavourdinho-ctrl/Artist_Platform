import type { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { prisma } from '../config/db.js';
import { config } from '../config/index.js';
import { HttpError } from '../lib/httpError.js';
import { recordAudit } from '../services/auditService.js';
import {
  createArtworkSchema,
  updateArtworkSchema,
  updateArtistProfileSchema,
} from '../schemas/studioSchemas.js';

const ARTWORK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function artworkId(req: Request): string {
  const id = req.params.id;
  if (!id || !ARTWORK_ID.test(id)) {
    throw new HttpError(400, 'Invalid artwork id', { code: 'INVALID_ID' });
  }
  return id;
}

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

function checkedArtworkImages(
  userId: string,
  images: Array<{
    publicId: string;
    secureUrl: string;
    resourceType: 'image';
    format: string;
    width: number;
    height: number;
    bytes: number;
    version: number;
    signature: string;
    altText?: string;
  }>,
) {
  return images.map((image, position) => {
    checkedCloudinaryAsset(userId, 'artworks', image);
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
}

function checkedCloudinaryAsset(
  userId: string,
  folderName: 'artworks' | 'profile' | 'cover',
  image: { publicId: string; secureUrl: string; version: number; signature: string },
) {
  const folder = `artists/${userId}/${folderName}/`;
  const apiSecret = config.cloudinary.apiSecret;
  if (!apiSecret || !config.cloudinary.cloudName) {
    throw new HttpError(503, 'Image uploads are not configured', { code: 'CLOUDINARY_NOT_CONFIGURED' });
  }
  const assetUrl = new URL(image.secureUrl);
  const pathname = decodeURIComponent(assetUrl.pathname);
  const expectedSignature = createHash('sha1')
    .update(`public_id=${image.publicId}&version=${image.version}${apiSecret}`)
    .digest();
  const providedSignature = Buffer.from(image.signature, 'hex');
  if (
    !image.publicId.startsWith(folder) ||
    image.publicId.includes('..') ||
    image.publicId.includes('\\') ||
    assetUrl.protocol !== 'https:' ||
    assetUrl.hostname !== 'res.cloudinary.com' ||
    !pathname.includes(`/${config.cloudinary.cloudName}/image/upload/`) ||
    !pathname.includes(`/${image.publicId}.`) ||
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    throw new HttpError(400, 'Invalid Cloudinary asset ownership or signature', {
      code: 'INVALID_CLOUDINARY_ASSET',
    });
  }
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
      include: {
        images: { orderBy: { position: 'asc' } },
        inventory: { select: { quantity: true, reservedQuantity: true, soldQuantity: true } },
        moderationHistory: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { action: true, reason: true, createdAt: true },
        },
      },
    });

    res.json({
      success: true,
      data: {
        artworks: artworks.map((artwork) => ({
          ...artwork,
          imageUrl: artwork.images.find((image) => image.isPrimary)?.url ?? artwork.images[0]?.url ?? '',
          available: Boolean(
            artwork.inventory &&
              artwork.inventory.quantity - artwork.inventory.reservedQuantity - artwork.inventory.soldQuantity > 0,
          ),
          priceReconciliationRequired: artwork.currency.toUpperCase() !== 'USD',
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

    const images = checkedArtworkImages(userId, body.images);

    const artwork = await prisma.artwork.create({
      data: {
        title: body.title,
        description: body.description,
        price: body.price,
        currency: body.currency,
        slug: slugify(body.title),
        artistId: artist.id,
        images: { create: images },
        inventory: { create: {} },
      },
      include: { images: { orderBy: { position: 'asc' } }, inventory: true },
    });

    res.status(201).json({ success: true, data: artwork });
  } catch (err) {
    next(err);
  }
}

export async function updateStudioArtwork(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('Authenticated user is required');
    const id = artworkId(req);
    const body = updateArtworkSchema.parse(req.body);
    const artist = await prisma.artistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!artist) throw new HttpError(403, 'Artist profile required', { code: 'ARTIST_REQUIRED' });

    const existing = await prisma.artwork.findFirst({
      where: { id, artistId: artist.id },
      select: { id: true, currency: true, status: true },
    });
    if (!existing) throw new HttpError(404, 'Artwork not found', { code: 'ARTWORK_NOT_FOUND' });
    if (!['DRAFT', 'REJECTED'].includes(existing.status)) {
      throw new HttpError(409, 'Only draft or rejected artwork can be edited.', {
        code: 'ARTWORK_NOT_EDITABLE',
      });
    }
    if (existing.currency.toUpperCase() !== 'USD' && body.price !== undefined) {
      throw new HttpError(409, 'Legacy non-USD pricing cannot be edited in the USD listing flow.', {
        code: 'LEGACY_PRICE_RECONCILIATION_REQUIRED',
      });
    }

    const images = checkedArtworkImages(userId, body.images);
    const artwork = await prisma.$transaction(async (tx) => {
      const update = await tx.artwork.updateMany({
        where: { id, artistId: artist.id, status: existing.status },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.price !== undefined ? { price: body.price } : {}),
          ...(body.yearCreated !== undefined ? { yearCreated: body.yearCreated } : {}),
          ...(body.width !== undefined ? { width: body.width } : {}),
          ...(body.height !== undefined ? { height: body.height } : {}),
          ...(body.depth !== undefined ? { depth: body.depth } : {}),
          ...(body.materials !== undefined ? { materials: body.materials } : {}),
        },
      });
      if (update.count !== 1) {
        throw new HttpError(409, 'Artwork changed while it was being edited.', {
          code: 'ARTWORK_STATE_CONFLICT',
        });
      }
      await tx.artworkImage.deleteMany({ where: { artworkId: id } });
      await tx.artworkImage.createMany({
        data: images.map((image) => ({ ...image, artworkId: id })),
      });
      await recordAudit(tx, {
        actorId: userId,
        action: 'ARTWORK_UPDATED',
        entityType: 'Artwork',
        entityId: id,
        metadata: { status: existing.status },
      });
      return tx.artwork.findUniqueOrThrow({
        where: { id },
        include: { images: { orderBy: { position: 'asc' } }, inventory: true },
      });
    });
    res.json({ success: true, data: artwork });
  } catch (err) {
    next(err);
  }
}

export async function submitStudioArtwork(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('Authenticated user is required');
    const id = artworkId(req);
    const artist = await prisma.artistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!artist) throw new HttpError(403, 'Artist profile required', { code: 'ARTIST_REQUIRED' });

    const result = await prisma.$transaction(async (tx) => {
      const artwork = await tx.artwork.findFirst({
        where: { id, artistId: artist.id },
        select: { id: true, status: true, title: true, price: true, currency: true, images: { select: { id: true } } },
      });
      if (!artwork) throw new HttpError(404, 'Artwork not found', { code: 'ARTWORK_NOT_FOUND' });
      if (!['DRAFT', 'REJECTED'].includes(artwork.status)) {
        throw new HttpError(409, 'Only a draft or corrected rejected artwork can be submitted.', {
          code: 'INVALID_ARTWORK_TRANSITION',
        });
      }
      if (artwork.currency.toUpperCase() !== 'USD' || artwork.price.lte(0) || !artwork.images.length) {
        throw new HttpError(409, 'Add valid USD pricing and at least one image before review.', {
          code: 'ARTWORK_REVIEW_REQUIREMENTS_NOT_MET',
        });
      }
      const updated = await tx.artwork.updateMany({
        where: { id, artistId: artist.id, status: artwork.status },
        data: { status: 'PENDING_REVIEW', visibility: 'PRIVATE' },
      });
      if (updated.count !== 1) {
        throw new HttpError(409, 'Artwork changed while it was being submitted.', {
          code: 'ARTWORK_STATE_CONFLICT',
        });
      }
      await tx.artworkModeration.create({
        data: { artworkId: id, action: 'SUBMITTED' },
      });
      await recordAudit(tx, {
        actorId: userId,
        action: 'ARTWORK_SUBMITTED',
        entityType: 'Artwork',
        entityId: id,
        metadata: { fromStatus: artwork.status, toStatus: 'PENDING_REVIEW' },
      });
      return { id, status: 'PENDING_REVIEW' };
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function publishStudioArtwork(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('Authenticated user is required');
    const id = artworkId(req);
    const artist = await prisma.artistProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!artist) throw new HttpError(403, 'Artist profile required', { code: 'ARTIST_REQUIRED' });
    const updated = await prisma.$transaction(async (tx) => {
      const transition = await tx.artwork.updateMany({
        where: { id, artistId: artist.id, status: 'APPROVED', currency: { equals: 'USD', mode: 'insensitive' } },
        data: { status: 'PUBLISHED', visibility: 'PUBLIC', publishedAt: new Date() },
      });
      if (transition.count !== 1) {
        const owned = await tx.artwork.findFirst({
          where: { id, artistId: artist.id },
          select: { status: true, currency: true },
        });
        if (!owned) throw new HttpError(404, 'Artwork not found', { code: 'ARTWORK_NOT_FOUND' });
        throw new HttpError(409, 'Only approved USD artwork can be published.', {
          code: 'INVALID_ARTWORK_TRANSITION',
        });
      }
      await recordAudit(tx, {
        actorId: userId,
        action: 'ARTWORK_PUBLISHED',
        entityType: 'Artwork',
        entityId: id,
        metadata: { fromStatus: 'APPROVED', toStatus: 'PUBLISHED', visibility: 'PUBLIC' },
      });
      return tx.artwork.findUniqueOrThrow({
        where: { id },
        select: { id: true, status: true, visibility: true, publishedAt: true },
      });
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function archiveStudioArtwork(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('Authenticated user is required');
    const id = artworkId(req);
    const artist = await prisma.artistProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!artist) throw new HttpError(403, 'Artist profile required', { code: 'ARTIST_REQUIRED' });
    const result = await prisma.$transaction(async (tx) => {
      const artwork = await tx.artwork.findFirst({
        where: { id, artistId: artist.id },
        select: { id: true, status: true },
      });
      if (!artwork) throw new HttpError(404, 'Artwork not found', { code: 'ARTWORK_NOT_FOUND' });
      if (!['DRAFT', 'REJECTED', 'APPROVED', 'PUBLISHED'].includes(artwork.status)) {
        throw new HttpError(409, 'This artwork cannot be archived from its current state.', {
          code: 'INVALID_ARTWORK_TRANSITION',
        });
      }
      const updated = await tx.artwork.updateMany({
        where: { id, artistId: artist.id, status: artwork.status },
        data: { status: 'ARCHIVED', visibility: 'PRIVATE' },
      });
      if (updated.count !== 1) {
        throw new HttpError(409, 'Artwork changed while it was being archived.', {
          code: 'ARTWORK_STATE_CONFLICT',
        });
      }
      await recordAudit(tx, {
        actorId: userId,
        action: 'ARTWORK_ARCHIVED',
        entityType: 'Artwork',
        entityId: id,
        metadata: { fromStatus: artwork.status, toStatus: 'ARCHIVED' },
      });
      return { id, status: 'ARCHIVED' };
    });
    res.json({ success: true, data: result });
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

    const purpose = typeof req.query.purpose === 'string' ? req.query.purpose : 'artwork';
    const folderName = purpose === 'profile' ? 'profile' : purpose === 'cover' ? 'cover' : purpose === 'artwork' ? 'artworks' : null;
    if (!folderName) {
      throw new HttpError(400, 'Unsupported image upload purpose', { code: 'INVALID_UPLOAD_PURPOSE' });
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `artists/${userId}/${folderName}`;
    const signature = createHash('sha1')
      .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
      .digest('hex');

    res.json({ status: 'success', data: { timestamp, signature, apiKey, cloudName, folder } });
  } catch (err) {
    next(err);
  }
}

export async function getStudioArtistProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('Authenticated user is required');
    const profile = await prisma.artistProfile.findUnique({
      where: { userId },
      select: {
        id: true, displayName: true, biography: true, artisticStatement: true, mission: true,
        website: true, slug: true, location: true, profileImageUrl: true, coverImageUrl: true,
        verificationStatus: true,
      },
    });
    if (!profile) throw new HttpError(404, 'Artist profile not found', { code: 'ARTIST_PROFILE_NOT_FOUND' });
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}

export async function updateArtistProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('Authenticated user is required');
    const body = updateArtistProfileSchema.parse(req.body);
    const { profileImage, coverImage, ...profileFields } = body;
    const checkedImageUrl = (image: typeof profileImage, folder: 'profile' | 'cover') => {
      if (!image) return undefined;
      checkedCloudinaryAsset(userId, folder, image);
      return image.secureUrl;
    };
    const profileImageUrl = checkedImageUrl(profileImage, 'profile');
    const coverImageUrl = checkedImageUrl(coverImage, 'cover');
    const data = {
      ...profileFields,
      ...(profileImageUrl ? { profileImageUrl } : {}),
      ...(coverImageUrl ? { coverImageUrl } : {}),
    };

    const existingProfile = await prisma.artistProfile.findUnique({ where: { userId }, select: { id: true } });
    const profile = existingProfile
      ? await prisma.artistProfile.update({
          where: { userId },
          data,
          select: {
            displayName: true, biography: true, artisticStatement: true, mission: true, website: true,
            slug: true, location: true, profileImageUrl: true, coverImageUrl: true, verificationStatus: true,
          },
        })
      : await prisma.artistProfile.create({
          data: {
            userId,
            ...data,
            slug: `${profileFields.displayName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')}-${userId.slice(0, 8)}`,
          },
          select: {
            displayName: true, biography: true, artisticStatement: true, mission: true, website: true,
            slug: true, location: true, profileImageUrl: true, coverImageUrl: true, verificationStatus: true,
          },
        });

    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}
