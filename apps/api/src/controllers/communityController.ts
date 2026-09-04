import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/db.js';
import { HttpError } from '../lib/httpError.js';
import { createCommunityPostSchema } from '../schemas/communitySchemas.js';

export async function listCommunityPosts(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize ?? 12), 1), 50);
    const [posts, total] = await Promise.all([
      prisma.communityPost.findMany({
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          artist: { select: { id: true, displayName: true, slug: true, profileImageUrl: true } },
          artwork: { select: { id: true, slug: true, title: true } },
        },
      }),
      prisma.communityPost.count(),
    ]);
    res.json({
      status: 'success',
      data: posts,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    next(error);
  }
}

export async function createCommunityPost(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) throw new HttpError(401, 'Login required', { code: 'AUTH_REQUIRED' });
    const input = createCommunityPostSchema.parse(req.body);
    const artist = await prisma.artistProfile.findUnique({ where: { userId } });
    if (!artist)
      throw new HttpError(403, 'An artist profile is required', { code: 'ARTIST_ROLE_REQUIRED' });

    const post = await prisma.communityPost.create({
      data: { ...input, artistId: artist.id, authorId: userId },
      include: { artist: true, artwork: true },
    });
    res.status(201).json({ status: 'success', data: post });
  } catch (error) {
    next(error);
  }
}
