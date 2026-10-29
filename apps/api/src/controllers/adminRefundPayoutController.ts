import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { financialProviderAdapter } from '../services/financialProvider.js';
import {
  authorizePayoutRetry,
  authorizeRefundRetry,
  calculateArtistPayoutAmount,
  createArtistPayout,
  decidePayout,
  decideRefund,
  reconcilePayout,
  reconcileRefund,
  requestRefund,
  submitPayout,
  submitRefund,
} from '../services/refundPayoutService.js';
import type {
  ListPayoutsQuery,
  ListRefundsQuery,
  EligiblePayoutsQuery,
} from '../validation/refundPayout.js';

function idParam(req: Request): string {
  const value = req.params.id;
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, 'Invalid financial operation id.', { code: 'INVALID_ID' });
  }
  return value;
}

function operationWhere(query: ListRefundsQuery | ListPayoutsQuery) {
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.currency ? { currency: { equals: query.currency, mode: 'insensitive' as const } } : {}),
    ...(query.from || query.to
      ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {}),
    ...(query.reference
      ? {
          OR: [
            { id: query.reference },
            { idempotencyKey: { contains: query.reference, mode: 'insensitive' as const } },
            { providerReference: { contains: query.reference, mode: 'insensitive' as const } },
            { order: { is: { orderNumber: { contains: query.reference, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  };
}

export async function listAdminRefunds(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListRefundsQuery;
  const where = operationWhere(query) as Prisma.RefundRequestWhereInput;
  const [rows, total] = await Promise.all([
    prisma.refundRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        paymentId: true,
        amountMinorUnits: true,
        currency: true,
        reason: true,
        status: true,
        provider: true,
        providerReference: true,
        attemptCount: true,
        lastAttemptAt: true,
        lastErrorCode: true,
        createdAt: true,
        updatedAt: true,
        order: { select: { id: true, orderNumber: true } },
        payment: { select: { status: true } },
      },
    }),
    prisma.refundRequest.count({ where }),
  ]);
  res.json({
    status: 'success',
    data: rows.map((row) => ({ ...row, amountMinorUnits: row.amountMinorUnits.toString() })),
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
  });
}

export async function getAdminRefund(req: Request, res: Response): Promise<void> {
  const refund = await prisma.refundRequest.findUnique({
    where: { id: idParam(req) },
    select: {
      id: true,
      paymentId: true,
      orderId: true,
      requestedBy: true,
      decidedBy: true,
      amountMinorUnits: true,
      currency: true,
      reason: true,
      status: true,
      idempotencyKey: true,
      provider: true,
      providerReference: true,
      providerEventId: true,
      attemptCount: true,
      lastAttemptAt: true,
      nextRetryAt: true,
      lastErrorCode: true,
      decidedAt: true,
      submittedAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      order: { select: { id: true, orderNumber: true, status: true } },
      payment: { select: { id: true, provider: true, providerPaymentId: true, status: true } },
      events: {
        orderBy: { occurredAt: 'asc' },
        select: { id: true, actorId: true, eventType: true, fromStatus: true, toStatus: true, reason: true, providerReference: true, occurredAt: true },
      },
    },
  });
  if (!refund) throw new HttpError(404, 'Refund request not found.', { code: 'REFUND_NOT_FOUND' });
  res.json({
    status: 'success',
    data: { ...refund, amountMinorUnits: refund.amountMinorUnits.toString() },
  });
}

export async function createAdminRefund(req: Request, res: Response): Promise<void> {
  const refund = await requestRefund({
    ...req.body,
    actorId: req.user!.id,
  });
  res.status(201).json({
    status: 'success',
    data: {
      ...refund,
      amountMinorUnits: refund.amountMinorUnits.toString(),
    },
  });
}

export async function decideAdminRefund(req: Request, res: Response): Promise<void> {
  const refund = await decideRefund({
    ...req.body,
    refundId: idParam(req),
    actorId: req.user!.id,
  });
  res.json({ status: 'success', data: { ...refund, amountMinorUnits: refund.amountMinorUnits.toString() } });
}

export async function retryAdminRefund(req: Request, res: Response): Promise<void> {
  const refund = await authorizeRefundRetry({
    ...req.body,
    refundId: idParam(req),
    actorId: req.user!.id,
  });
  res.json({ status: 'success', data: { ...refund, amountMinorUnits: refund.amountMinorUnits.toString() } });
}

export async function submitAdminRefund(req: Request, res: Response): Promise<void> {
  const refund = await submitRefund(idParam(req), req.user!.id, financialProviderAdapter);
  res.status(202).json({ status: 'success', data: { ...refund, amountMinorUnits: refund.amountMinorUnits.toString() } });
}

export async function reconcileAdminRefund(req: Request, res: Response): Promise<void> {
  const refund = await reconcileRefund(idParam(req), req.user!.id, financialProviderAdapter);
  res.json({ status: 'success', data: { ...refund, amountMinorUnits: refund.amountMinorUnits.toString() } });
}

export async function listAdminPayouts(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListPayoutsQuery;
  const where = operationWhere(query) as Prisma.ArtistPayoutWhereInput;
  const [rows, total] = await Promise.all([
    prisma.artistPayout.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        fulfillmentId: true,
        orderId: true,
        artistId: true,
        amountMinorUnits: true,
        commissionMinorUnits: true,
        currency: true,
        status: true,
        provider: true,
        providerReference: true,
        attemptCount: true,
        lastAttemptAt: true,
        lastErrorCode: true,
        createdAt: true,
        updatedAt: true,
        order: { select: { id: true, orderNumber: true } },
      },
    }),
    prisma.artistPayout.count({ where }),
  ]);
  res.json({
    status: 'success',
    data: rows.map((row) => ({
      ...row,
      amountMinorUnits: row.amountMinorUnits.toString(),
      commissionMinorUnits: row.commissionMinorUnits.toString(),
    })),
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
  });
}

export async function listAdminEligiblePayouts(req: Request, res: Response): Promise<void> {
  const { page, pageSize, currency, reference, from, to } =
    req.query as unknown as EligiblePayoutsQuery;
  const where: Prisma.ArtistOrderFulfillmentWhereInput = {
    payout: { is: null },
    order: {
      is: {
        releaseStatus: 'ELIGIBLE',
        buyerReceivedGoodAt: { not: null },
        releaseHoldAt: null,
        ...(currency ? { currency: { equals: currency, mode: 'insensitive' as const } } : {}),
        ...(from || to
          ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
        deliveryDisputes: { none: { status: 'OPEN' } },
        payments: {
          some: { status: 'SUCCEEDED' },
          none: { status: { in: ['PARTIALLY_REFUNDED', 'REFUNDED'] } },
        },
        refunds: { none: { status: { in: [...RESERVED_REFUND_STATUSES_FOR_QUERY] } } },
        ...(reference
          ? { orderNumber: { contains: reference, mode: 'insensitive' } }
          : {}),
      },
    },
  };
  const [rows, total] = await Promise.all([
    prisma.artistOrderFulfillment.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        artistId: true,
        orderId: true,
        artist: { select: { displayName: true } },
        order: {
          select: {
            orderNumber: true,
            currency: true,
            items: {
              select: { artistId: true, currency: true, subtotal: true, commissionAmount: true },
            },
          },
        },
      },
    }),
    prisma.artistOrderFulfillment.count({ where }),
  ]);
  const eligible = rows.map((row) => {
    const items = row.order.items.filter((item) => item.artistId === row.artistId);
    const { amountMinorUnits, commissionMinorUnits } =
      calculateArtistPayoutAmount(items, row.order.currency);
    return {
      fulfillmentId: row.id,
      artistId: row.artistId,
      artistName: row.artist.displayName,
      orderId: row.orderId,
      orderNumber: row.order.orderNumber,
      amountMinorUnits: amountMinorUnits.toString(),
      commissionMinorUnits: commissionMinorUnits.toString(),
      currency: row.order.currency,
    };
  });
  res.json({
    status: 'success',
    data: eligible,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function getAdminPayout(req: Request, res: Response): Promise<void> {
  const payout = await prisma.artistPayout.findUnique({
    where: { id: idParam(req) },
    select: {
      id: true,
      fulfillmentId: true,
      orderId: true,
      artistId: true,
      requestedBy: true,
      decidedBy: true,
      amountMinorUnits: true,
      commissionMinorUnits: true,
      currency: true,
      status: true,
      idempotencyKey: true,
      provider: true,
      providerReference: true,
      providerEventId: true,
      attemptCount: true,
      lastAttemptAt: true,
      nextRetryAt: true,
      lastErrorCode: true,
      decidedAt: true,
      submittedAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      order: { select: { id: true, orderNumber: true, releaseStatus: true } },
      fulfillment: { select: { id: true, shippedAt: true, artistCompletionConfirmedAt: true } },
      events: {
        orderBy: { occurredAt: 'asc' },
        select: { id: true, actorId: true, eventType: true, fromStatus: true, toStatus: true, reason: true, providerReference: true, occurredAt: true },
      },
    },
  });
  if (!payout) throw new HttpError(404, 'Artist payout not found.', { code: 'PAYOUT_NOT_FOUND' });
  res.json({
    status: 'success',
    data: {
      ...payout,
      amountMinorUnits: payout.amountMinorUnits.toString(),
      commissionMinorUnits: payout.commissionMinorUnits.toString(),
    },
  });
}

export async function createAdminPayout(req: Request, res: Response): Promise<void> {
  const payout = await createArtistPayout({ ...req.body, actorId: req.user!.id });
  res.status(201).json({
    status: 'success',
    data: {
      ...payout,
      amountMinorUnits: payout.amountMinorUnits.toString(),
      commissionMinorUnits: payout.commissionMinorUnits.toString(),
    },
  });
}

export async function decideAdminPayout(req: Request, res: Response): Promise<void> {
  const payout = await decidePayout({
    ...req.body,
    payoutId: idParam(req),
    actorId: req.user!.id,
  });
  res.json({ status: 'success', data: { ...payout, amountMinorUnits: payout.amountMinorUnits.toString() } });
}

export async function retryAdminPayout(req: Request, res: Response): Promise<void> {
  const payout = await authorizePayoutRetry({
    ...req.body,
    payoutId: idParam(req),
    actorId: req.user!.id,
  });
  res.json({ status: 'success', data: { ...payout, amountMinorUnits: payout.amountMinorUnits.toString() } });
}

export async function submitAdminPayout(req: Request, res: Response): Promise<void> {
  const payout = await submitPayout(idParam(req), req.user!.id, financialProviderAdapter);
  res.status(202).json({ status: 'success', data: { ...payout, amountMinorUnits: payout.amountMinorUnits.toString() } });
}

export async function reconcileAdminPayout(req: Request, res: Response): Promise<void> {
  const payout = await reconcilePayout(idParam(req), req.user!.id, financialProviderAdapter);
  res.json({ status: 'success', data: { ...payout, amountMinorUnits: payout.amountMinorUnits.toString() } });
}

const RESERVED_REFUND_STATUSES_FOR_QUERY = [
  'REQUESTED', 'APPROVED', 'SUBMITTED', 'PENDING', 'MANUAL_RECONCILIATION', 'SUCCEEDED',
] as const;
