import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/httpError.js';
import { financialProviderAdapter } from '../services/financialProvider.js';

export async function getStudioEarnings(req: Request, res: Response): Promise<void> {
  const artist = await prisma.artistProfile.findUnique({
    where: { userId: req.user!.id },
    select: { id: true },
  });
  if (!artist) throw new HttpError(403, 'Artist profile required', { code: 'ARTIST_REQUIRED' });

  const where: Prisma.ArtistPayoutWhereInput = { artistId: artist.id };
  const [payouts, activities] = await Promise.all([
    prisma.artistPayout.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        orderId: true,
        fulfillmentId: true,
        amountMinorUnits: true,
        commissionMinorUnits: true,
        currency: true,
        status: true,
        provider: true,
        providerReference: true,
        submittedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        order: {
          select: {
            orderNumber: true,
            releaseStatus: true,
            releaseEligibleAt: true,
          },
        },
        events: {
          orderBy: { occurredAt: 'asc' },
          select: { eventType: true, fromStatus: true, toStatus: true, occurredAt: true },
        },
      },
    }),
    prisma.financialActivity.findMany({
      where: { payout: { is: { artistId: artist.id } } },
      orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        movementType: true,
        amountMinorUnits: true,
        currency: true,
        provider: true,
        providerObjectReference: true,
        occurredAt: true,
        recordedAt: true,
        order: { select: { orderNumber: true } },
      },
    }),
  ]);

  res.json({
    status: 'success',
    data: {
      payouts: payouts.map((payout) => ({
        ...payout,
        amountMinorUnits: payout.amountMinorUnits.toString(),
        commissionMinorUnits: payout.commissionMinorUnits.toString(),
      })),
      confirmedActivities: activities.map((activity) => ({
        ...activity,
        amountMinorUnits: activity.amountMinorUnits.toString(),
      })),
      providerConfigured: financialProviderAdapter.configured,
    },
  });
}
