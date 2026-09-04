import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/db.js';
import { HttpError } from '../lib/httpError.js';
import {
  createCommissionSchema,
  createProposalSchema,
  proposalDecisionSchema,
  updateCommissionStatusSchema,
} from '../schemas/commissionSchemas.js';

const commissionInclude = {
  buyer: { select: { id: true, firstName: true, lastName: true, email: true } },
  artist: {
    select: { id: true, userId: true, displayName: true, slug: true, profileImageUrl: true },
  },
  references: true,
  proposal: true,
  conversation: { select: { id: true } },
} as const;

function requireUser(req: Request): string {
  if (!req.user?.id) throw new HttpError(401, 'Login required', { code: 'AUTH_REQUIRED' });
  return req.user.id;
}

function requireParam(value: string | undefined, name: string): string {
  if (!value) throw new HttpError(400, `${name} is required`, { code: 'INVALID_ROUTE_PARAM' });
  return value;
}

async function getCommissionForUser(id: string, userId: string) {
  const commission = await prisma.commissionRequest.findUnique({
    where: { id },
    include: commissionInclude,
  });
  if (!commission)
    throw new HttpError(404, 'Commission request not found', { code: 'COMMISSION_NOT_FOUND' });

  const isBuyer = commission.buyerId === userId;
  const isArtist = commission.artist.userId === userId;
  if (!isBuyer && !isArtist) {
    throw new HttpError(403, 'You cannot access this commission', { code: 'COMMISSION_FORBIDDEN' });
  }
  return { commission, isBuyer, isArtist };
}

export async function createCommission(req: Request, res: Response, next: NextFunction) {
  try {
    const buyerId = requireUser(req);
    const input = createCommissionSchema.parse(req.body);
    const artist = await prisma.artistProfile.findUnique({ where: { id: input.artistId } });
    if (!artist) throw new HttpError(404, 'Artist not found', { code: 'ARTIST_NOT_FOUND' });

    const commission = await prisma.commissionRequest.create({
      data: {
        buyerId,
        artistId: input.artistId,
        title: input.title,
        description: input.description,
        category: input.category,
        style: input.style,
        dimensions: input.dimensions,
        intendedUse: input.intendedUse,
        notes: input.notes,
        budget: input.budget,
        currency: input.currency,
        deadline: input.deadline,
        references: { create: input.references },
      },
      include: commissionInclude,
    });
    res.status(201).json({ status: 'success', data: commission });
  } catch (error) {
    next(error);
  }
}

export async function listMyCommissions(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const commissions = await prisma.commissionRequest.findMany({
      where: { OR: [{ buyerId: userId }, { artist: { userId } }] },
      orderBy: { updatedAt: 'desc' },
      include: commissionInclude,
    });
    res.json({ status: 'success', data: commissions });
  } catch (error) {
    next(error);
  }
}

export async function getCommission(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const { commission } = await getCommissionForUser(
      requireParam(req.params.id, 'Commission ID'),
      userId,
    );
    res.json({ status: 'success', data: commission });
  } catch (error) {
    next(error);
  }
}

export async function updateCommissionStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const input = updateCommissionStatusSchema.parse(req.body);
    const { commission, isArtist } = await getCommissionForUser(
      requireParam(req.params.id, 'Commission ID'),
      userId,
    );
    const artistOnly = ['REVIEWING', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED'];
    if (artistOnly.includes(input.status) && !isArtist) {
      throw new HttpError(403, 'Only the assigned artist can change this status', {
        code: 'COMMISSION_ROLE_REQUIRED',
      });
    }
    const updated = await prisma.commissionRequest.update({
      where: { id: commission.id },
      data: { status: input.status },
      include: commissionInclude,
    });
    res.json({ status: 'success', data: updated });
  } catch (error) {
    next(error);
  }
}

export async function createProposal(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const input = createProposalSchema.parse(req.body);
    const { commission, isArtist } = await getCommissionForUser(
      requireParam(req.params.id, 'Commission ID'),
      userId,
    );
    if (!isArtist)
      throw new HttpError(403, 'Only the assigned artist can create a proposal', {
        code: 'COMMISSION_ROLE_REQUIRED',
      });

    const proposal = await prisma.commissionProposal.upsert({
      where: { commissionId: commission.id },
      create: { commissionId: commission.id, artistId: commission.artistId, ...input },
      update: { ...input, status: 'PENDING' },
    });
    await prisma.commissionRequest.update({
      where: { id: commission.id },
      data: { status: 'REVIEWING' },
    });
    res.status(201).json({ status: 'success', data: proposal });
  } catch (error) {
    next(error);
  }
}

export async function decideProposal(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const input = proposalDecisionSchema.parse(req.body);
    const { commission, isBuyer } = await getCommissionForUser(
      requireParam(req.params.id, 'Commission ID'),
      userId,
    );
    if (!isBuyer)
      throw new HttpError(403, 'Only the buyer can decide on this proposal', {
        code: 'COMMISSION_ROLE_REQUIRED',
      });
    if (!commission.proposal)
      throw new HttpError(404, 'Commission proposal not found', { code: 'PROPOSAL_NOT_FOUND' });

    const proposal = await prisma.commissionProposal.update({
      where: { commissionId: commission.id },
      data: { status: input.status },
    });
    await prisma.commissionRequest.update({
      where: { id: commission.id },
      data: { status: input.status === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED' },
    });
    res.json({ status: 'success', data: proposal });
  } catch (error) {
    next(error);
  }
}
