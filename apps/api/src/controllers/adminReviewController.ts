import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/httpError.js';
import type { ModerateReviewInput } from '../validation/review.js';

const ACTION_TO_STATUS = {
  approve: 'APPROVED',
  reject: 'REJECTED',
} as const;

/*
  Explainer: GET /api/v1/admin/reviews — the moderation queue. Gated by
  requireAdmin at the route level, so only a logged-in user with the
  ADMIN role ever reaches this handler.
*/
export async function listPendingReviews(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        artwork: { select: { id: true, title: true } },
      },
    }),
    prisma.review.count({ where: { status: 'PENDING' } }),
  ]);

  res.json({
    status: 'success',
    data: reviews,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

/*
  Explainer: PATCH /api/v1/admin/reviews/:id — approve or reject.
  schema.prisma's Review model has no moderatedBy/moderatedAt columns,
  and ArtworkModeration (despite the similar name) is for moderating
  Artwork LISTINGS, not Reviews — reusing it here would misuse a table
  meant for a different entity. AuditLog is the schema's existing
  general-purpose "who did what, to what, when" table, so that's what
  records this action instead. The status update and the audit record
  are wrapped in a transaction so they can never end up out of sync —
  either both happen or neither does.
*/
export async function moderateReview(req: Request, res: Response) {
  const { id } = req.params;
  const { action, reason } = req.body as ModerateReviewInput;
  const adminId = req.user!.id; // requireAdmin guarantees this is set

  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) {
    throw new HttpError(404, 'Review not found', { code: 'REVIEW_NOT_FOUND' });
  }

  const status = ACTION_TO_STATUS[action];

  const [updated] = await prisma.$transaction([
    prisma.review.update({ where: { id }, data: { status } }),
    prisma.auditLog.create({
      data: {
        userId: adminId,
        action: `REVIEW_${action.toUpperCase()}`,
        entityType: 'Review',
        entityId: id,
        metadata: reason ? { reason } : undefined,
      },
    }),
  ]);

  res.json({
    status: 'success',
    data: { id: updated.id, status: updated.status },
  });
}
