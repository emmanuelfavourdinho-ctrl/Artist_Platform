import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/httpError.js';
import { recordAudit } from '../services/auditService.js';
import type {
  CreateReportInput,
  ListReportsQuery,
  UpdateReportInput,
} from '../validation/reports.js';

type ReportRow = {
  id: string;
  targetType: 'USER' | 'ARTWORK';
  targetId: string;
  reason: string;
  description: string | null;
  status: 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';
  resolutionNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

function reportFields(report: ReportRow) {
  return {
    id: report.id,
    targetType: report.targetType,
    reason: report.reason,
    description: report.description,
    status: report.status,
    resolutionNote: report.resolutionNote,
    reviewedAt: report.reviewedAt,
    createdAt: report.createdAt,
  };
}

async function subjectFor(targetType: ReportRow['targetType'], targetId: string) {
  if (targetType === 'USER') {
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: {
        firstName: true,
        lastName: true,
        status: true,
        artistProfile: { select: { displayName: true, slug: true } },
      },
    });
    return user ? { type: 'USER' as const, ...user } : null;
  }
  const artwork = await prisma.artwork.findUnique({
    where: { id: targetId },
    select: {
      title: true,
      slug: true,
      status: true,
      visibility: true,
      images: { where: { isPrimary: true }, take: 1, select: { url: true, altText: true } },
      artist: { select: { displayName: true, slug: true } },
    },
  });
  return artwork ? { type: 'ARTWORK' as const, ...artwork } : null;
}

async function subjectsFor(reports: ReportRow[]) {
  const userIds = [
    ...new Set(reports.filter((r) => r.targetType === 'USER').map((r) => r.targetId)),
  ];
  const artworkIds = [
    ...new Set(reports.filter((r) => r.targetType === 'ARTWORK').map((r) => r.targetId)),
  ];
  const [users, artworks] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            artistProfile: { select: { displayName: true, slug: true } },
          },
        })
      : Promise.resolve([]),
    artworkIds.length
      ? prisma.artwork.findMany({
          where: { id: { in: artworkIds } },
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            visibility: true,
            images: { where: { isPrimary: true }, take: 1, select: { url: true, altText: true } },
            artist: { select: { displayName: true, slug: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const userById = new Map(users.map(({ id, ...user }) => [id, user]));
  const artworkById = new Map(artworks.map(({ id, ...artwork }) => [id, artwork]));
  return reports.map((report) => {
    const targetId = report.targetId;
    return {
      ...reportFields(report),
      subject:
        report.targetType === 'USER'
          ? userById.get(targetId)
            ? { type: 'USER' as const, ...userById.get(targetId)! }
            : null
          : artworkById.get(targetId)
            ? { type: 'ARTWORK' as const, ...artworkById.get(targetId)! }
            : null,
    };
  });
}

export async function createReport(req: Request, res: Response) {
  const body = req.body as CreateReportInput;
  let targetId: string;
  if (body.targetType === 'USER') {
    const artistProfile = await prisma.artistProfile.findUnique({
      where: { slug: body.targetSlug },
      select: { userId: true },
    });
    if (!artistProfile) {
      throw new HttpError(404, 'Reported artist not found', { code: 'REPORT_TARGET_NOT_FOUND' });
    }
    targetId = artistProfile.userId;
  } else {
    const artwork = await prisma.artwork.findFirst({
      where: { slug: body.targetSlug, status: 'PUBLISHED', visibility: 'PUBLIC' },
      select: { id: true },
    });
    if (!artwork) {
      throw new HttpError(404, 'Reported artwork not found', { code: 'REPORT_TARGET_NOT_FOUND' });
    }
    targetId = artwork.id;
  }

  const report = await prisma.report.create({
    data: {
      reporterId: req.user!.id,
      targetType: body.targetType,
      targetId,
      reason: body.reason,
      description: body.description || null,
    },
    select: { id: true, status: true, createdAt: true },
  });
  res.status(201).json({ status: 'success', data: report });
}

export async function listReports(req: Request, res: Response) {
  const { page, pageSize, status } = req.query as unknown as ListReportsQuery;
  const where: Prisma.ReportWhereInput =
    status === 'OPEN' ? { status: { in: ['PENDING', 'REVIEWING'] } } : status ? { status } : {};
  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        targetType: true,
        targetId: true,
        reason: true,
        description: true,
        status: true,
        resolutionNote: true,
        reviewedAt: true,
        createdAt: true,
      },
    }),
    prisma.report.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: await subjectsFor(reports as ReportRow[]),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function getReportDetail(req: Request, res: Response) {
  const report = (await prisma.report.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      reason: true,
      description: true,
      status: true,
      resolutionNote: true,
      reviewedAt: true,
      createdAt: true,
    },
  })) as ReportRow | null;
  if (!report) throw new HttpError(404, 'Report not found', { code: 'REPORT_NOT_FOUND' });
  res.json({
    status: 'success',
    data: {
      ...reportFields(report),
      subject: await subjectFor(report.targetType, report.targetId),
    },
  });
}

const ALLOWED_TRANSITIONS: Record<ReportRow['status'], readonly ReportRow['status'][]> = {
  PENDING: ['REVIEWING', 'RESOLVED', 'DISMISSED'],
  REVIEWING: ['RESOLVED', 'DISMISSED'],
  RESOLVED: [],
  DISMISSED: [],
};

export async function decideReport(req: Request, res: Response) {
  const input = req.body as UpdateReportInput;
  const { status } = input;
  const resolutionNote = input.status === 'REVIEWING' ? null : input.resolutionNote;
  const actorId = req.user!.id;
  const id = req.params.id;
  const result = await prisma.$transaction(async (tx) => {
    const current = (await tx.report.findUnique({
      where: { id },
      select: { id: true, targetType: true, status: true },
    })) as Pick<ReportRow, 'id' | 'targetType' | 'status'> | null;
    if (!current) throw new HttpError(404, 'Report not found', { code: 'REPORT_NOT_FOUND' });
    if (!ALLOWED_TRANSITIONS[current.status].includes(status)) {
      throw new HttpError(409, 'This report cannot make that status transition', {
        code: 'INVALID_REPORT_TRANSITION',
      });
    }

    const now = new Date();
    const changed = await tx.report.updateMany({
      where: { id, status: current.status },
      data: {
        status,
        reviewedBy: actorId,
        reviewedAt: now,
        resolutionNote,
      },
    });
    if (changed.count !== 1) {
      throw new HttpError(409, 'This report was updated by another moderator', {
        code: 'REPORT_STATUS_CONFLICT',
      });
    }

    await recordAudit(tx, {
      actorId,
      action: 'REPORT_REVIEWED',
      entityType: 'Report',
      entityId: id,
      requestId: req.id ?? null,
      reason: status === 'REVIEWING' ? null : resolutionNote,
      metadata: {
        reportId: id,
        targetType: current.targetType,
        fromStatus: current.status,
        toStatus: status,
      },
    });
    return { id, status, reviewedBy: actorId, reviewedAt: now, resolutionNote };
  });
  res.json({ status: 'success', data: result });
}
