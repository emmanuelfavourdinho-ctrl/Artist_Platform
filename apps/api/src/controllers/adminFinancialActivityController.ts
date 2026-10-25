import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { minorUnitsToLegacyStripeDecimal } from '../lib/money.js';
import type { ListAdminFinancialActivitiesQuery } from '../validation/adminFinance.js';

export async function listAdminFinancialActivities(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListAdminFinancialActivitiesQuery;
  const { page, pageSize, movementType, provider, currency, from, to, reference } = query;
  const where: Prisma.FinancialActivityWhereInput = {
    ...(movementType ? { movementType } : {}),
    ...(provider ? { provider: { equals: provider, mode: 'insensitive' } } : {}),
    ...(currency ? { currency: { equals: currency, mode: 'insensitive' } } : {}),
    ...(from || to
      ? { recordedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    ...(reference
      ? {
          OR: [
            { movementIdentifier: { contains: reference, mode: 'insensitive' } },
            { providerObjectReference: { contains: reference, mode: 'insensitive' } },
            { sourceEventId: reference },
            { checkoutSessionId: reference },
            { orderId: reference },
            { paymentId: reference },
          ],
        }
      : {}),
  };

  const [activities, total] = await Promise.all([
    prisma.financialActivity.findMany({
      where,
      orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        movementIdentifier: true,
        movementType: true,
        amountMinorUnits: true,
        currency: true,
        provider: true,
        providerObjectReference: true,
        occurredAt: true,
        recordedAt: true,
        sourceEventId: true,
        checkoutSessionId: true,
        order: { select: { id: true, orderNumber: true } },
        payment: { select: { id: true, status: true } },
      },
    }),
    prisma.financialActivity.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: activities.map((activity) => ({
      ...activity,
      amountMinorUnits: activity.amountMinorUnits.toString(),
      amount: minorUnitsToLegacyStripeDecimal(activity.amountMinorUnits, activity.currency),
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}
