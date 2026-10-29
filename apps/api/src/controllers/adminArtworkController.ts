import type { Request, Response } from 'express';
import type { AuditAction, ModerationAction } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/httpError.js';
import { recordAudit } from '../services/auditService.js';
import type {
  ListArtworkQueueQuery,
  ModerateArtworkInput,
} from '../validation/artworkModeration.js';

const ARTWORK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ARTWORK_REVIEW_SELECT = {
  id: true,
  title: true,
  slug: true,
  description: true,
  price: true,
  currency: true,
  yearCreated: true,
  width: true,
  height: true,
  depth: true,
  materials: true,
  status: true,
  visibility: true,
  createdAt: true,
  images: {
    orderBy: { position: 'asc' as const },
    select: { id: true, url: true, altText: true, width: true, height: true, isPrimary: true },
  },
  categories: { select: { category: { select: { id: true, name: true } } } },
  styles: { select: { style: { select: { id: true, name: true } } } },
  themes: { select: { theme: { select: { id: true, name: true } } } },
  mediums: { select: { medium: { select: { id: true, name: true } } } },
  artist: { select: { id: true, displayName: true, slug: true, profileImageUrl: true } },
} as const;

const ACTION_TO_STATUS = { approve: 'APPROVED', reject: 'REJECTED' } as const;
const ACTION_TO_HISTORY: Record<keyof typeof ACTION_TO_STATUS, ModerationAction> = {
  approve: 'APPROVED',
  reject: 'REJECTED',
};
const ACTION_TO_AUDIT: Record<keyof typeof ACTION_TO_STATUS, AuditAction> = {
  approve: 'ARTWORK_MODERATED',
  reject: 'ARTWORK_MODERATED',
};

function artworkId(req: Request): string {
  const id = req.params.id;
  if (!id || !ARTWORK_ID.test(id)) {
    throw new HttpError(400, 'Invalid artwork id', { code: 'INVALID_ID' });
  }
  return id;
}

export async function listPendingArtwork(req: Request, res: Response) {
  const { page, pageSize } = req.query as unknown as ListArtworkQueueQuery;
  const where = { status: 'PENDING_REVIEW' as const };
  const [artworks, total] = await Promise.all([
    prisma.artwork.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: ARTWORK_REVIEW_SELECT,
    }),
    prisma.artwork.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: artworks,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function pendingArtworkDetail(req: Request, res: Response) {
  const id = artworkId(req);
  const artwork = await prisma.artwork.findFirst({
    where: { id, status: 'PENDING_REVIEW' },
    select: {
      ...ARTWORK_REVIEW_SELECT,
      moderationHistory: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, action: true, reason: true, createdAt: true, adminId: true },
      },
    },
  });
  if (!artwork) {
    throw new HttpError(404, 'Pending artwork not found', { code: 'ARTWORK_NOT_FOUND' });
  }
  res.json({ status: 'success', data: artwork });
}

export async function moderateArtworkDecision(req: Request, res: Response) {
  const id = artworkId(req);
  const { action, reason } = req.body as ModerateArtworkInput;
  const moderatorId = req.user!.id;
  const nextStatus = ACTION_TO_STATUS[action];

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.artwork.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new HttpError(404, 'Artwork not found', { code: 'ARTWORK_NOT_FOUND' });
    }
    if (existing.status !== 'PENDING_REVIEW') {
      throw new HttpError(409, 'Artwork is no longer awaiting moderation', {
        code: 'ARTWORK_ALREADY_MODERATED',
      });
    }

    // This conditional write, not the preliminary read, decides the winner
    // if two moderators act concurrently. PostgreSQL rechecks status after
    // waiting for a conflicting row update.
    const transition = await tx.artwork.updateMany({
      where: { id, status: 'PENDING_REVIEW' },
      data: { status: nextStatus },
    });
    if (transition.count === 0) {
      throw new HttpError(409, 'Artwork is no longer awaiting moderation', {
        code: 'ARTWORK_ALREADY_MODERATED',
      });
    }

    await tx.artworkModeration.create({
      data: {
        artworkId: id,
        adminId: moderatorId,
        action: ACTION_TO_HISTORY[action],
        reason: action === 'reject' ? reason : null,
      },
    });
    await recordAudit(tx, {
      actorId: moderatorId,
      action: ACTION_TO_AUDIT[action],
      entityType: 'Artwork',
      entityId: id,
      requestId: req.id ?? null,
      reason: action === 'reject' ? reason : null,
      metadata: { fromStatus: 'PENDING_REVIEW', toStatus: nextStatus, decision: action },
    });

    return { id, status: nextStatus };
  });

  res.json({ status: 'success', data: result });
}
