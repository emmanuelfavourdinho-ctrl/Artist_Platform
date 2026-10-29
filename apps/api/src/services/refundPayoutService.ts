import { Prisma } from '@prisma/client';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { toLegacyStripeMinorUnits } from '../lib/money.js';
import { recordAudit } from './auditService.js';
import {
  FinancialProviderError,
  type FinancialProviderAdapter,
  type ProviderReconciliationResult,
  type ProviderSubmissionResult,
} from './financialProvider.js';

type Tx = Prisma.TransactionClient;
type OperationStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUBMITTED'
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'MANUAL_RECONCILIATION';

const RESERVED_REFUND_STATUSES: OperationStatus[] = [
  'REQUESTED',
  'APPROVED',
  'SUBMITTED',
  'PENDING',
  'MANUAL_RECONCILIATION',
  'SUCCEEDED',
];

export function calculateArtistPayoutAmount(
  items: Array<{
    currency: string;
    subtotal: { toString(): string };
    commissionAmount: { toString(): string };
  }>,
  currency: string,
): { amountMinorUnits: bigint; grossMinorUnits: bigint; commissionMinorUnits: bigint } {
  if (!items.length) {
    throw new HttpError(409, 'Fulfillment has no order items to pay.', {
      code: 'PAYOUT_ITEMS_MISSING',
    });
  }
  let grossMinorUnits = 0n;
  let commissionMinorUnits = 0n;
  for (const item of items) {
    if (item.currency.toUpperCase() !== currency.toUpperCase()) {
      throw new HttpError(409, 'Order item currency mismatch requires manual reconciliation.', {
        code: 'CURRENCY_MISMATCH',
      });
    }
    grossMinorUnits += toLegacyStripeMinorUnits(item.subtotal.toString(), currency);
    commissionMinorUnits += toLegacyStripeMinorUnits(item.commissionAmount.toString(), currency);
  }
  const amountMinorUnits = grossMinorUnits - commissionMinorUnits;
  if (commissionMinorUnits > grossMinorUnits || amountMinorUnits <= 0n) {
    throw new HttpError(409, 'Stored commission values do not support a positive payout.', {
      code: 'INVALID_PAYOUT_AMOUNT',
    });
  }
  return { amountMinorUnits, grossMinorUnits, commissionMinorUnits };
}

function requirePositiveMinorUnits(value: string): bigint {
  if (!/^[1-9]\d{0,17}$/.test(value)) {
    throw new HttpError(400, 'Amount must be a positive integer number of minor units.', {
      code: 'INVALID_MINOR_UNIT_AMOUNT',
    });
  }
  return BigInt(value);
}

function isUniqueConstraintFor(error: unknown, field: string): boolean {
  if (
    !error ||
    typeof error !== 'object' ||
    !('code' in error) ||
    error.code !== 'P2002' ||
    !('meta' in error) ||
    !error.meta ||
    typeof error.meta !== 'object' ||
    !('target' in error.meta)
  ) {
    return false;
  }
  const target = error.meta.target;
  return Array.isArray(target)
    ? target.includes(field)
    : typeof target === 'string' && target.includes(field);
}

function assertSameIdempotentRequest(
  existing: { paymentId: string; amountMinorUnits: bigint; reason: string; requestedBy: string },
  input: { paymentId: string; amountMinorUnits: bigint; reason: string; requestedBy: string },
): void {
  if (
    existing.paymentId !== input.paymentId ||
    existing.amountMinorUnits !== input.amountMinorUnits ||
    existing.reason !== input.reason ||
    existing.requestedBy !== input.requestedBy
  ) {
    throw new HttpError(409, 'Idempotency key was already used for a different refund request.', {
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  }
}

async function lockPayment(tx: Tx, paymentId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE
  `);
}

async function lockOrder(tx: Tx, orderId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
}

async function assertPayoutStillEligible(tx: Tx, payoutId: string): Promise<void> {
  const payout = await tx.artistPayout.findUniqueOrThrow({
    where: { id: payoutId },
    select: {
      fulfillmentId: true,
      orderId: true,
      artistId: true,
      amountMinorUnits: true,
      commissionMinorUnits: true,
      currency: true,
      fulfillment: { select: { orderId: true, artistId: true } },
      order: {
        select: {
          currency: true,
          releaseStatus: true,
          buyerReceivedGoodAt: true,
          releaseHoldAt: true,
          deliveryDisputes: { where: { status: 'OPEN' }, select: { id: true }, take: 1 },
          payments: {
            where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
            select: { id: true, status: true, currency: true },
          },
          refunds: {
            where: { status: { in: RESERVED_REFUND_STATUSES } },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  const order = payout.order;
  if (
    payout.fulfillment.orderId !== payout.orderId ||
    payout.fulfillment.artistId !== payout.artistId ||
    payout.currency.toUpperCase() !== order.currency.toUpperCase() ||
    order.releaseStatus !== 'ELIGIBLE' ||
    !order.buyerReceivedGoodAt ||
    order.releaseHoldAt ||
    order.deliveryDisputes.length > 0 ||
    order.payments.length === 0 ||
    order.payments.some(
      (payment) =>
        payment.status !== 'SUCCEEDED' ||
        payment.currency.toUpperCase() !== payout.currency.toUpperCase(),
    )
  ) {
    throw new HttpError(409, 'Payout conditions changed; reconcile eligibility before authorization.', {
      code: 'PAYOUT_NOT_ELIGIBLE',
    });
  }
  if (order.refunds.length > 0) {
    throw new HttpError(409, 'Refund activity blocks payout authorization until resolved.', {
      code: 'REFUND_RECONCILIATION_REQUIRED',
    });
  }

  const items = await tx.orderItem.findMany({
    where: { orderId: payout.orderId, artistId: payout.artistId },
    select: { currency: true, subtotal: true, commissionAmount: true },
  });
  const amount = calculateArtistPayoutAmount(items, payout.currency);
  if (
    amount.amountMinorUnits !== payout.amountMinorUnits ||
    amount.commissionMinorUnits !== payout.commissionMinorUnits
  ) {
    throw new HttpError(409, 'Stored payout no longer matches the order commission snapshots.', {
      code: 'PAYOUT_AMOUNT_MISMATCH',
    });
  }
}

async function addOperationEvent(
  tx: Tx,
  input: {
    refundRequestId?: string;
    artistPayoutId?: string;
    actorId: string | null;
    eventType:
      | 'REQUESTED'
      | 'APPROVED'
      | 'REJECTED'
      | 'SUBMITTED'
      | 'PROVIDER_PENDING'
      | 'SUCCEEDED'
      | 'FAILED'
      | 'MANUAL_RECONCILIATION'
      | 'RETRY_AUTHORIZED';
    fromStatus: string | null;
    toStatus: string;
    reason?: string | null;
    providerReference?: string | null;
    metadata?: Prisma.InputJsonObject;
  },
): Promise<void> {
  await tx.financialOperationEvent.create({
    data: {
      refundRequestId: input.refundRequestId,
      artistPayoutId: input.artistPayoutId,
      actorId: input.actorId,
      eventType: input.eventType,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      reason: input.reason ?? null,
      providerReference: input.providerReference ?? null,
      metadata: input.metadata,
    },
  });
  await recordAudit(tx, {
    actorId: input.actorId,
    action: 'FINANCIAL_OPERATION_CHANGED',
    entityType: input.refundRequestId ? 'RefundRequest' : 'ArtistPayout',
    entityId: input.refundRequestId ?? input.artistPayoutId,
    reason: input.reason ?? input.eventType,
    metadata: {
      eventType: input.eventType,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      providerReference: input.providerReference ?? null,
      ...(input.metadata ?? {}),
    },
  });
}

export async function requestRefund(input: {
  paymentId: string;
  amountMinorUnits: string;
  reason: string;
  idempotencyKey: string;
  actorId: string;
}) {
  const amountMinorUnits = requirePositiveMinorUnits(input.amountMinorUnits);
  try {
    return await prisma.$transaction(async (tx) => {
      const prior = await tx.refundRequest.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: {
          id: true,
          paymentId: true,
          amountMinorUnits: true,
          reason: true,
          requestedBy: true,
          status: true,
        },
      });
      if (prior) {
        assertSameIdempotentRequest(prior, {
          paymentId: input.paymentId,
          amountMinorUnits,
          reason: input.reason,
          requestedBy: input.actorId,
        });
        return prior;
      }

      const paymentKey = await tx.payment.findUnique({
        where: { id: input.paymentId },
        select: { orderId: true },
      });
      if (!paymentKey)
        throw new HttpError(404, 'Payment not found.', { code: 'PAYMENT_NOT_FOUND' });
      await lockOrder(tx, paymentKey.orderId);
      await lockPayment(tx, input.paymentId);
      const duplicate = await tx.refundRequest.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: {
          id: true,
          paymentId: true,
          amountMinorUnits: true,
          reason: true,
          requestedBy: true,
          status: true,
        },
      });
      if (duplicate) {
        assertSameIdempotentRequest(duplicate, {
          paymentId: input.paymentId,
          amountMinorUnits,
          reason: input.reason,
          requestedBy: input.actorId,
        });
        return duplicate;
      }
      const payment = await tx.payment.findUnique({
        where: { id: input.paymentId },
        select: {
          id: true,
          orderId: true,
          amount: true,
          currency: true,
          status: true,
          order: { select: { id: true, currency: true } },
        },
      });
      if (!payment) throw new HttpError(404, 'Payment not found.', { code: 'PAYMENT_NOT_FOUND' });
      if (!['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
        throw new HttpError(409, 'Only a captured payment can be refunded.', {
          code: 'PAYMENT_NOT_CAPTURED',
        });
      }
      const currency = payment.currency.toUpperCase();
      if (payment.order.currency.toUpperCase() !== currency) {
        throw new HttpError(
          409,
          'Payment and order currencies differ; manual reconciliation is required.',
          {
            code: 'CURRENCY_MISMATCH',
          },
        );
      }

      const paidOut = await tx.artistPayout.findFirst({
        where: {
          orderId: payment.orderId,
          status: {
            in: ['APPROVED', 'SUBMITTED', 'PENDING', 'SUCCEEDED', 'MANUAL_RECONCILIATION'],
          },
        },
        select: { id: true },
      });
      if (paidOut) {
        throw new HttpError(
          409,
          'An artist payout exists for this order; refund requires manual reconciliation.',
          {
            code: 'PAYOUT_RECONCILIATION_REQUIRED',
          },
        );
      }

      const captured = toLegacyStripeMinorUnits(payment.amount.toString(), currency);
      const reserved = await tx.refundRequest.aggregate({
        where: { paymentId: payment.id, status: { in: RESERVED_REFUND_STATUSES } },
        _sum: { amountMinorUnits: true },
      });
      const alreadyReserved = reserved._sum.amountMinorUnits ?? 0n;
      if (amountMinorUnits > captured - alreadyReserved) {
        throw new HttpError(409, 'Refund amount exceeds the unrefunded captured amount.', {
          code: 'REFUND_AMOUNT_EXCEEDS_REMAINING',
        });
      }

      const refund = await tx.refundRequest.create({
        data: {
          paymentId: payment.id,
          orderId: payment.orderId,
          requestedBy: input.actorId,
          amountMinorUnits,
          currency,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        },
        select: {
          id: true,
          paymentId: true,
          orderId: true,
          amountMinorUnits: true,
          currency: true,
          reason: true,
          status: true,
          idempotencyKey: true,
          createdAt: true,
        },
      });
      await addOperationEvent(tx, {
        refundRequestId: refund.id,
        actorId: input.actorId,
        eventType: 'REQUESTED',
        fromStatus: null,
        toStatus: 'REQUESTED',
        reason: input.reason,
      });
      return refund;
    });
  } catch (error) {
    if (isUniqueConstraintFor(error, 'idempotencyKey')) {
      throw new HttpError(409, 'Idempotency key was already used for a refund request.', {
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
    }
    throw error;
  }
}

export async function decideRefund(input: {
  refundId: string;
  actorId: string;
  decision: 'APPROVE' | 'REJECT';
  reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.refundRequest.findUnique({
      where: { id: input.refundId },
      select: { id: true, paymentId: true, orderId: true, requestedBy: true, status: true },
    });
    if (!current)
      throw new HttpError(404, 'Refund request not found.', { code: 'REFUND_NOT_FOUND' });
    await lockOrder(tx, current.orderId);
    await lockPayment(tx, current.paymentId);
    const latest = await tx.refundRequest.findUniqueOrThrow({
      where: { id: current.id },
      select: { id: true, paymentId: true, orderId: true, requestedBy: true, status: true },
    });
    const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    if (latest.status !== 'REQUESTED') {
      throw new HttpError(409, 'Only a requested refund can be decided.', {
        code: 'INVALID_REFUND_TRANSITION',
      });
    }
    if (input.decision === 'APPROVE' && latest.requestedBy === input.actorId) {
      throw new HttpError(403, 'A refund requester cannot approve their own request.', {
        code: 'SELF_APPROVAL_FORBIDDEN',
      });
    }
    const updated = await tx.refundRequest.updateMany({
      where: { id: latest.id, status: 'REQUESTED' },
      data: { status, decidedBy: input.actorId, decidedAt: new Date(), lastErrorCode: null },
    });
    if (updated.count !== 1) {
      throw new HttpError(409, 'Refund was decided concurrently.', { code: 'STATE_CONFLICT' });
    }
    await addOperationEvent(tx, {
      refundRequestId: latest.id,
      actorId: input.actorId,
      eventType: status,
      fromStatus: latest.status,
      toStatus: status,
      reason: input.reason,
    });
    return tx.refundRequest.findUniqueOrThrow({ where: { id: latest.id } });
  });
}

export async function authorizeRefundRetry(input: {
  refundId: string;
  actorId: string;
  reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.refundRequest.findUnique({
      where: { id: input.refundId },
      select: { id: true, paymentId: true, orderId: true, status: true },
    });
    if (!current)
      throw new HttpError(404, 'Refund request not found.', { code: 'REFUND_NOT_FOUND' });
    await lockOrder(tx, current.orderId);
    await lockPayment(tx, current.paymentId);
    const latest = await tx.refundRequest.findUniqueOrThrow({
      where: { id: current.id },
      select: {
        id: true,
        paymentId: true,
        amountMinorUnits: true,
        currency: true,
        status: true,
      },
    });
    if (latest.status !== 'FAILED') {
      throw new HttpError(409, 'Only a definitively failed refund can be retried.', {
        code: 'INVALID_REFUND_RETRY',
      });
    }
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: latest.paymentId },
      select: { amount: true, currency: true, status: true },
    });
    if (
      !['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status) ||
      payment.currency.toUpperCase() !== latest.currency.toUpperCase()
    ) {
      throw new HttpError(409, 'Captured payment state no longer supports this refund retry.', {
        code: 'PAYMENT_NOT_CAPTURED',
      });
    }
    const capturedMinorUnits = toLegacyStripeMinorUnits(
      payment.amount.toString(),
      latest.currency,
    );
    const reserved = await tx.refundRequest.aggregate({
      where: {
        paymentId: latest.paymentId,
        status: { in: RESERVED_REFUND_STATUSES },
      },
      _sum: { amountMinorUnits: true },
    });
    if (latest.amountMinorUnits > capturedMinorUnits - (reserved._sum.amountMinorUnits ?? 0n)) {
      throw new HttpError(409, 'Refund retry exceeds the remaining captured amount.', {
        code: 'REFUND_AMOUNT_EXCEEDS_REMAINING',
      });
    }
    await tx.refundRequest.update({
      where: { id: latest.id },
      data: { status: 'APPROVED', nextRetryAt: null, lastErrorCode: null },
    });
    await addOperationEvent(tx, {
      refundRequestId: latest.id,
      actorId: input.actorId,
      eventType: 'RETRY_AUTHORIZED',
      fromStatus: 'FAILED',
      toStatus: 'APPROVED',
      reason: input.reason,
    });
    return tx.refundRequest.findUniqueOrThrow({ where: { id: latest.id } });
  });
}

export async function createArtistPayout(input: {
  fulfillmentId: string;
  idempotencyKey: string;
  actorId: string;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const prior = await tx.artistPayout.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: {
          id: true,
          fulfillmentId: true,
          idempotencyKey: true,
          status: true,
          amountMinorUnits: true,
          commissionMinorUnits: true,
          currency: true,
        },
      });
      if (prior) {
        if (prior.fulfillmentId !== input.fulfillmentId) {
          throw new HttpError(409, 'Idempotency key was already used for a different payout.', {
            code: 'IDEMPOTENCY_KEY_REUSED',
          });
        }
        return prior;
      }
      const existing = await tx.artistPayout.findUnique({
        where: { fulfillmentId: input.fulfillmentId },
        select: {
          id: true,
          fulfillmentId: true,
          idempotencyKey: true,
          status: true,
          amountMinorUnits: true,
          commissionMinorUnits: true,
          currency: true,
        },
      });
      if (existing) {
        if (existing.idempotencyKey !== input.idempotencyKey) {
          throw new HttpError(409, 'A payout operation already exists for this fulfillment.', {
            code: 'PAYOUT_ALREADY_EXISTS',
          });
        }
        return existing;
      }
      const candidate = await tx.artistOrderFulfillment.findUnique({
        where: { id: input.fulfillmentId },
        select: { id: true, orderId: true, artistId: true },
      });
      if (!candidate)
        throw new HttpError(404, 'Artist fulfillment not found.', {
          code: 'FULFILLMENT_NOT_FOUND',
        });
      await lockOrder(tx, candidate.orderId);
      const duplicate = await tx.artistPayout.findUnique({
        where: { fulfillmentId: input.fulfillmentId },
        select: {
          id: true,
          fulfillmentId: true,
          idempotencyKey: true,
          status: true,
          amountMinorUnits: true,
          commissionMinorUnits: true,
          currency: true,
        },
      });
      if (duplicate) {
        if (duplicate.idempotencyKey !== input.idempotencyKey) {
          throw new HttpError(409, 'A payout operation already exists for this fulfillment.', {
            code: 'PAYOUT_ALREADY_EXISTS',
          });
        }
        return duplicate;
      }
      const fulfillment = await tx.artistOrderFulfillment.findUnique({
        where: { id: input.fulfillmentId },
        select: {
          id: true,
          orderId: true,
          artistId: true,
          order: {
            select: {
              currency: true,
              releaseStatus: true,
              buyerReceivedGoodAt: true,
              releaseHoldAt: true,
              deliveryDisputes: { where: { status: 'OPEN' }, select: { id: true }, take: 1 },
              payments: {
                where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
                select: { id: true, status: true, currency: true },
              },
              refunds: {
                where: { status: { in: RESERVED_REFUND_STATUSES } },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      });
      if (!fulfillment)
        throw new HttpError(404, 'Artist fulfillment not found.', {
          code: 'FULFILLMENT_NOT_FOUND',
        });
      const order = fulfillment.order;
      if (
        order.releaseStatus !== 'ELIGIBLE' ||
        !order.buyerReceivedGoodAt ||
        order.releaseHoldAt ||
        order.deliveryDisputes.length > 0 ||
        order.payments.length === 0 ||
        order.payments.some(
          (payment) =>
            payment.status !== 'SUCCEEDED' ||
            payment.currency.toUpperCase() !== currency,
        )
      ) {
        throw new HttpError(409, 'Order is not currently eligible for payout creation.', {
          code: 'PAYOUT_NOT_ELIGIBLE',
        });
      }
      if (order.refunds.length > 0) {
        throw new HttpError(409, 'Refund activity must be resolved before payout creation.', {
          code: 'REFUND_RECONCILIATION_REQUIRED',
        });
      }

      const items = await tx.orderItem.findMany({
        where: { orderId: fulfillment.orderId, artistId: fulfillment.artistId },
        select: { currency: true, subtotal: true, commissionAmount: true },
      });
      const currency = order.currency.toUpperCase();
      const { amountMinorUnits, grossMinorUnits, commissionMinorUnits } =
        calculateArtistPayoutAmount(items, currency);

      const payout = await tx.artistPayout.create({
        data: {
          fulfillmentId: fulfillment.id,
          orderId: fulfillment.orderId,
          artistId: fulfillment.artistId,
          requestedBy: input.actorId,
          amountMinorUnits,
          currency,
          commissionMinorUnits,
          idempotencyKey: input.idempotencyKey,
        },
        select: {
          id: true,
          fulfillmentId: true,
          orderId: true,
          artistId: true,
          amountMinorUnits: true,
          commissionMinorUnits: true,
          currency: true,
          status: true,
          idempotencyKey: true,
          createdAt: true,
        },
      });
      await addOperationEvent(tx, {
        artistPayoutId: payout.id,
        actorId: input.actorId,
        eventType: 'REQUESTED',
        fromStatus: null,
        toStatus: 'REQUESTED',
        reason: 'Payout operation created from the stored commission snapshots.',
        metadata: { grossMinorUnits: grossMinorUnits.toString(), currency },
      });
      return payout;
    });
  } catch (error) {
    if (isUniqueConstraintFor(error, 'idempotencyKey')) {
      throw new HttpError(409, 'Idempotency key was already used for a payout.', {
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
    }
    throw error;
  }
}

export async function decidePayout(input: {
  payoutId: string;
  actorId: string;
  decision: 'APPROVE' | 'REJECT';
  reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.artistPayout.findUnique({
      where: { id: input.payoutId },
      select: { id: true, orderId: true, requestedBy: true, status: true },
    });
    if (!current)
      throw new HttpError(404, 'Payout operation not found.', { code: 'PAYOUT_NOT_FOUND' });
    await lockOrder(tx, current.orderId);
    const latest = await tx.artistPayout.findUniqueOrThrow({
      where: { id: current.id },
      select: { id: true, orderId: true, requestedBy: true, status: true },
    });
    const activeRefund = await tx.refundRequest.findFirst({
      where: { orderId: latest.orderId, status: { in: RESERVED_REFUND_STATUSES } },
      select: { id: true },
    });
    if (input.decision === 'APPROVE' && activeRefund) {
      throw new HttpError(409, 'Refund activity must be resolved before payout approval.', {
        code: 'REFUND_RECONCILIATION_REQUIRED',
      });
    }
    const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    if (latest.status !== 'REQUESTED') {
      throw new HttpError(409, 'Only a requested payout can be decided.', {
        code: 'INVALID_PAYOUT_TRANSITION',
      });
    }
    if (input.decision === 'APPROVE') {
      await assertPayoutStillEligible(tx, latest.id);
    }
    if (input.decision === 'APPROVE' && latest.requestedBy === input.actorId) {
      throw new HttpError(403, 'A payout requester cannot approve their own request.', {
        code: 'SELF_APPROVAL_FORBIDDEN',
      });
    }
    const updated = await tx.artistPayout.updateMany({
      where: { id: latest.id, status: 'REQUESTED' },
      data: { status, decidedBy: input.actorId, decidedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new HttpError(409, 'Payout was decided concurrently.', { code: 'STATE_CONFLICT' });
    }
    await addOperationEvent(tx, {
      artistPayoutId: latest.id,
      actorId: input.actorId,
      eventType: status,
      fromStatus: latest.status,
      toStatus: status,
      reason: input.reason,
    });
    return tx.artistPayout.findUniqueOrThrow({ where: { id: latest.id } });
  });
}

export async function authorizePayoutRetry(input: {
  payoutId: string;
  actorId: string;
  reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.artistPayout.findUnique({
      where: { id: input.payoutId },
      select: { id: true, orderId: true, status: true },
    });
    if (!current)
      throw new HttpError(404, 'Payout operation not found.', { code: 'PAYOUT_NOT_FOUND' });
    await lockOrder(tx, current.orderId);
    const latest = await tx.artistPayout.findUniqueOrThrow({
      where: { id: current.id },
      select: { id: true, orderId: true, status: true },
    });
    if (latest.status !== 'FAILED') {
      throw new HttpError(409, 'Only a definitively failed payout can be retried.', {
        code: 'INVALID_PAYOUT_RETRY',
      });
    }
    await assertPayoutStillEligible(tx, latest.id);
    const activeRefund = await tx.refundRequest.findFirst({
      where: { orderId: latest.orderId, status: { in: RESERVED_REFUND_STATUSES } },
      select: { id: true },
    });
    if (activeRefund) {
      throw new HttpError(409, 'Refund activity blocks payout retry until resolved.', {
        code: 'REFUND_RECONCILIATION_REQUIRED',
      });
    }
    await tx.artistPayout.update({
      where: { id: latest.id },
      data: { status: 'APPROVED', nextRetryAt: null, lastErrorCode: null },
    });
    await addOperationEvent(tx, {
      artistPayoutId: latest.id,
      actorId: input.actorId,
      eventType: 'RETRY_AUTHORIZED',
      fromStatus: 'FAILED',
      toStatus: 'APPROVED',
      reason: input.reason,
    });
    return tx.artistPayout.findUniqueOrThrow({ where: { id: latest.id } });
  });
}

async function claimRefundSubmission(refundId: string, actorId: string, providerName: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.refundRequest.findUnique({
      where: { id: refundId },
      select: { id: true, paymentId: true, orderId: true, status: true, attemptCount: true },
    });
    if (!current)
      throw new HttpError(404, 'Refund request not found.', { code: 'REFUND_NOT_FOUND' });
    await lockOrder(tx, current.orderId);
    await lockPayment(tx, current.paymentId);
    const latest = await tx.refundRequest.findUniqueOrThrow({
      where: { id: current.id },
      select: { id: true, paymentId: true, orderId: true, status: true, attemptCount: true },
    });
    if (latest.status !== 'APPROVED') {
      throw new HttpError(409, 'Only an approved refund can be submitted.', {
        code: 'INVALID_REFUND_TRANSITION',
      });
    }
    const now = new Date();
    await tx.refundRequest.update({
      where: { id: latest.id },
      data: {
        status: 'SUBMITTED',
        provider: providerName,
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        submittedAt: now,
        lastErrorCode: null,
      },
    });
    await addOperationEvent(tx, {
      refundRequestId: latest.id,
      actorId,
      eventType: 'SUBMITTED',
      fromStatus: 'APPROVED',
      toStatus: 'SUBMITTED',
      metadata: { attempt: latest.attemptCount + 1 },
    });
    const refund = await tx.refundRequest.findUniqueOrThrow({
      where: { id: latest.id },
      select: {
        id: true,
        paymentId: true,
        amountMinorUnits: true,
        currency: true,
        reason: true,
        idempotencyKey: true,
        providerReference: true,
        attemptCount: true,
        payment: { select: { providerPaymentId: true } },
      },
    });
    if (!refund.payment.providerPaymentId) {
      throw new HttpError(
        409,
        'Payment has no provider reference; manual reconciliation is required.',
        {
          code: 'PROVIDER_REFERENCE_MISSING',
        },
      );
    }
    return refund;
  });
}

async function claimPayoutSubmission(payoutId: string, actorId: string, providerName: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.artistPayout.findUnique({
      where: { id: payoutId },
      select: { id: true, orderId: true, status: true, attemptCount: true },
    });
    if (!current)
      throw new HttpError(404, 'Payout operation not found.', { code: 'PAYOUT_NOT_FOUND' });
    await lockOrder(tx, current.orderId);
    const latest = await tx.artistPayout.findUniqueOrThrow({
      where: { id: current.id },
      select: { id: true, status: true, attemptCount: true },
    });
    if (latest.status !== 'APPROVED') {
      throw new HttpError(409, 'Only an approved payout can be submitted.', {
        code: 'INVALID_PAYOUT_TRANSITION',
      });
    }
    await assertPayoutStillEligible(tx, latest.id);
    const now = new Date();
    await tx.artistPayout.update({
      where: { id: latest.id },
      data: {
        status: 'SUBMITTED',
        provider: providerName,
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        submittedAt: now,
        lastErrorCode: null,
      },
    });
    await addOperationEvent(tx, {
      artistPayoutId: latest.id,
      actorId,
      eventType: 'SUBMITTED',
      fromStatus: 'APPROVED',
      toStatus: 'SUBMITTED',
      metadata: { attempt: latest.attemptCount + 1 },
    });
    return tx.artistPayout.findUniqueOrThrow({
      where: { id: latest.id },
      select: {
        id: true,
        artistId: true,
        amountMinorUnits: true,
        currency: true,
        idempotencyKey: true,
        providerReference: true,
        attemptCount: true,
      },
    });
  });
}

async function applySubmissionResult(
  operation: { id: string; attemptCount: number },
  kind: 'refund' | 'payout',
  actorId: string,
  result: ProviderSubmissionResult,
  failureCode?: string,
) {
  const targetStatus: OperationStatus = failureCode
    ? 'MANUAL_RECONCILIATION'
    : result.accepted && result.providerReference
      ? 'PENDING'
      : result.accepted
        ? 'MANUAL_RECONCILIATION'
        : 'FAILED';
  const eventType =
    targetStatus === 'PENDING'
      ? 'PROVIDER_PENDING'
      : targetStatus === 'FAILED'
        ? 'FAILED'
        : 'MANUAL_RECONCILIATION';
  return prisma.$transaction(async (tx) => {
    let currentStatus: string | null = null;
    if (kind === 'refund') {
      const current = await tx.refundRequest.findUnique({
        where: { id: operation.id },
        select: { id: true, paymentId: true, orderId: true },
      });
      if (!current)
        throw new HttpError(404, 'Refund request not found.', { code: 'REFUND_NOT_FOUND' });
      await lockOrder(tx, current.orderId);
      await lockPayment(tx, current.paymentId);
      const latest = await tx.refundRequest.findUniqueOrThrow({
        where: { id: operation.id },
        select: { status: true },
      });
      currentStatus = latest.status;
    } else {
      const current = await tx.artistPayout.findUnique({
        where: { id: operation.id },
        select: { id: true, orderId: true },
      });
      if (!current)
        throw new HttpError(404, 'Payout operation not found.', { code: 'PAYOUT_NOT_FOUND' });
      await lockOrder(tx, current.orderId);
      const latest = await tx.artistPayout.findUniqueOrThrow({
        where: { id: operation.id },
        select: { status: true },
      });
      currentStatus = latest.status;
    }
    if (currentStatus !== 'SUBMITTED') {
      throw new HttpError(
        409,
        'Financial operation changed while provider submission was in progress.',
        {
          code: 'STATE_CONFLICT',
        },
      );
    }
    const data = {
      status: targetStatus,
      providerReference: result.providerReference,
      lastErrorCode:
        failureCode ??
        result.errorCode ??
        (targetStatus === 'MANUAL_RECONCILIATION' ? 'PROVIDER_REFERENCE_MISSING' : null),
    };
    if (kind === 'refund') {
      await tx.refundRequest.update({ where: { id: operation.id }, data });
    } else {
      await tx.artistPayout.update({ where: { id: operation.id }, data });
    }
    await addOperationEvent(tx, {
      ...(kind === 'refund' ? { refundRequestId: operation.id } : { artistPayoutId: operation.id }),
      actorId,
      eventType,
      fromStatus: 'SUBMITTED',
      toStatus: targetStatus,
      providerReference: result.providerReference,
      reason:
        targetStatus === 'MANUAL_RECONCILIATION'
          ? 'Provider submission outcome is uncertain; do not retry until reconciled.'
          : (result.errorCode ?? 'Provider submission requires manual reconciliation.'),
      metadata: {
        attempt: operation.attemptCount,
        errorCode:
          failureCode ??
          result.errorCode ??
          (targetStatus === 'MANUAL_RECONCILIATION' ? 'PROVIDER_REFERENCE_MISSING' : null),
      },
    });
    return kind === 'refund'
      ? tx.refundRequest.findUniqueOrThrow({ where: { id: operation.id } })
      : tx.artistPayout.findUniqueOrThrow({ where: { id: operation.id } });
  });
}

export async function submitRefund(
  refundId: string,
  actorId: string,
  adapter: FinancialProviderAdapter,
) {
  if (!adapter.configured) {
    throw new HttpError(503, 'Refund provider is not configured; no refund was submitted.', {
      code: 'PROVIDER_UNCONFIGURED',
    });
  }
  const refund = await claimRefundSubmission(refundId, actorId, adapter.providerName);
  try {
    const result = await adapter.submitRefund({
      idempotencyKey: `${refund.idempotencyKey}:attempt:${refund.attemptCount}`,
      providerPaymentReference: refund.payment.providerPaymentId!,
      amountMinorUnits: refund.amountMinorUnits.toString(),
      currency: refund.currency,
      reason: refund.reason,
    });
    return applySubmissionResult(refund, 'refund', actorId, result);
  } catch (error) {
    if (!(error instanceof FinancialProviderError)) throw error;
    return applySubmissionResult(
      refund,
      'refund',
      actorId,
      {
        accepted: false,
        providerReference: null,
        errorCode: error.code,
      },
      error.outcome === 'UNKNOWN' ? error.code : undefined,
    );
  }
}

export async function submitPayout(
  payoutId: string,
  actorId: string,
  adapter: FinancialProviderAdapter,
) {
  if (!adapter.configured) {
    throw new HttpError(503, 'Payout provider is not configured; no payout was submitted.', {
      code: 'PROVIDER_UNCONFIGURED',
    });
  }
  const payout = await claimPayoutSubmission(payoutId, actorId, adapter.providerName);
  try {
    const result = await adapter.submitPayout({
      idempotencyKey: `${payout.idempotencyKey}:attempt:${payout.attemptCount}`,
      internalArtistReference: payout.artistId,
      amountMinorUnits: payout.amountMinorUnits.toString(),
      currency: payout.currency,
    });
    return applySubmissionResult(payout, 'payout', actorId, result);
  } catch (error) {
    if (!(error instanceof FinancialProviderError)) throw error;
    return applySubmissionResult(
      payout,
      'payout',
      actorId,
      {
        accepted: false,
        providerReference: null,
        errorCode: error.code,
      },
      error.outcome === 'UNKNOWN' ? error.code : undefined,
    );
  }
}

async function applyReconciliationResult(
  id: string,
  kind: 'refund' | 'payout',
  actorId: string,
  result: ProviderReconciliationResult,
) {
  type ReconciliationOperation =
    | {
        kind: 'refund';
        id: string;
        paymentId: string;
        orderId: string;
        amountMinorUnits: bigint;
        currency: string;
        status: OperationStatus;
        provider: string | null;
        providerReference: string | null;
        idempotencyKey: string;
      }
    | {
        kind: 'payout';
        id: string;
        orderId: string;
        amountMinorUnits: bigint;
        currency: string;
        status: OperationStatus;
        provider: string | null;
        providerReference: string | null;
        idempotencyKey: string;
      };
  const current = await prisma.$transaction(async (tx) => {
    const loadOperation = async (): Promise<ReconciliationOperation | null> => {
      if (kind === 'refund') {
        const refund = await tx.refundRequest.findUnique({
          where: { id },
          select: {
            id: true,
            paymentId: true,
            orderId: true,
            amountMinorUnits: true,
            currency: true,
            status: true,
            provider: true,
            providerReference: true,
            idempotencyKey: true,
          },
        });
        return refund ? { ...refund, kind: 'refund' } : null;
      }
      const payout = await tx.artistPayout.findUnique({
        where: { id },
        select: {
          id: true,
          orderId: true,
          amountMinorUnits: true,
          currency: true,
          status: true,
          provider: true,
          providerReference: true,
          idempotencyKey: true,
        },
      });
      return payout ? { ...payout, kind: 'payout' } : null;
    };
    let operation = await loadOperation();
    if (!operation)
      throw new HttpError(404, 'Financial operation not found.', { code: 'OPERATION_NOT_FOUND' });
    if (operation.kind === 'refund') {
      await lockOrder(tx, operation.orderId);
      await lockPayment(tx, operation.paymentId);
    } else {
      await lockOrder(tx, operation.orderId);
    }
    operation = await loadOperation();
    if (!operation)
      throw new HttpError(404, 'Financial operation not found.', { code: 'OPERATION_NOT_FOUND' });
    if (!['SUBMITTED', 'PENDING', 'MANUAL_RECONCILIATION'].includes(operation.status)) {
      if (operation.status === 'SUCCEEDED') return operation;
      throw new HttpError(409, 'Only submitted or uncertain operations can be reconciled.', {
        code: 'INVALID_RECONCILIATION_STATE',
      });
    }
    const nextStatus: OperationStatus =
      result.status === 'SUCCEEDED' && !result.providerReference
        ? 'MANUAL_RECONCILIATION'
        : result.status === 'UNKNOWN'
          ? 'MANUAL_RECONCILIATION'
          : result.status;
    if (
      operation.providerReference &&
      result.providerReference &&
      operation.providerReference !== result.providerReference
    ) {
      throw new HttpError(
        409,
        'Provider reference changed during reconciliation; manual review is required.',
        {
          code: 'PROVIDER_REFERENCE_MISMATCH',
        },
      );
    }
    if (
      operation.status === nextStatus &&
      (nextStatus !== 'SUCCEEDED' ||
        (operation.kind === 'refund'
          ? await tx.financialActivity.findFirst({ where: { refundId: id }, select: { id: true } })
          : await tx.financialActivity.findFirst({
              where: { payoutId: id },
              select: { id: true },
            })))
    ) {
      return operation;
    }

    const provider = operation.provider;
    const providerReference = result.providerReference ?? operation.providerReference;
    const data = {
      status: nextStatus,
      providerReference,
      providerEventId: result.providerEventId ?? undefined,
      completedAt: nextStatus === 'SUCCEEDED' || nextStatus === 'FAILED' ? new Date() : null,
      lastErrorCode:
        result.status === 'UNKNOWN' ? (result.errorCode ?? 'PROVIDER_STATUS_UNKNOWN') : null,
    };
    if (operation.kind === 'refund') await tx.refundRequest.update({ where: { id }, data });
    else await tx.artistPayout.update({ where: { id }, data });

    if (nextStatus === 'SUCCEEDED') {
      if (!provider || !providerReference) {
        throw new HttpError(
          409,
          'Confirmed provider outcome is missing its stable provider reference.',
          {
            code: 'PROVIDER_REFERENCE_MISSING',
          },
        );
      }
      const activityData = {
        movementIdentifier: `${provider}:${operation.kind === 'refund' ? 'refund-confirmed' : 'artist-payout-confirmed'}:${providerReference}`,
        movementType:
          operation.kind === 'refund'
            ? ('REFUND_CONFIRMED' as const)
            : ('ARTIST_PAYOUT_CONFIRMED' as const),
        amountMinorUnits: operation.amountMinorUnits,
        currency: operation.currency,
        provider,
        providerObjectReference: providerReference,
        orderId: operation.orderId,
        paymentId: operation.kind === 'refund' ? operation.paymentId : null,
        refundId: operation.kind === 'refund' ? id : null,
        payoutId: operation.kind === 'payout' ? id : null,
        occurredAt: result.occurredAt,
        sourceEventId: result.providerEventId,
      };
      await tx.financialActivity.create({
        data: {
          ...activityData,
          checkoutSessionId: null,
        },
      });
      if (operation.kind === 'refund') {
        const refund = operation;
        const paid = await tx.payment.findUniqueOrThrow({
          where: { id: refund.paymentId },
          select: { amount: true },
        });
        const capturedMinor = toLegacyStripeMinorUnits(paid.amount.toString(), refund.currency);
        const refunded = await tx.refundRequest.aggregate({
          where: { paymentId: refund.paymentId, status: 'SUCCEEDED' },
          _sum: { amountMinorUnits: true },
        });
        const refundedMinor = refunded._sum.amountMinorUnits ?? 0n;
        await tx.payment.update({
          where: { id: refund.paymentId },
          data: { status: refundedMinor >= capturedMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
        });
        const allCapturedPayments = await tx.payment.findMany({
          where: {
            orderId: refund.orderId,
            status: { in: ['SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED'] },
          },
          select: { amount: true, currency: true },
        });
        const orderCurrency = refund.currency;
        const capturedOrderMinor = allCapturedPayments.reduce((sum, payment) => {
          if (payment.currency.toUpperCase() !== orderCurrency.toUpperCase()) {
            throw new HttpError(
              409,
              'Order contains multiple payment currencies; manual reconciliation is required.',
              {
                code: 'CURRENCY_MISMATCH',
              },
            );
          }
          return sum + toLegacyStripeMinorUnits(payment.amount.toString(), orderCurrency);
        }, 0n);
        const orderRefunded = await tx.refundRequest.aggregate({
          where: { orderId: refund.orderId, status: 'SUCCEEDED' },
          _sum: { amountMinorUnits: true },
        });
        const orderRefundedMinor = orderRefunded._sum.amountMinorUnits ?? 0n;
        await tx.order.update({
          where: { id: refund.orderId },
          data: {
            status: orderRefundedMinor >= capturedOrderMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          },
        });
      }
    }
    await addOperationEvent(tx, {
      ...(operation.kind === 'refund' ? { refundRequestId: id } : { artistPayoutId: id }),
      actorId,
      eventType:
        nextStatus === 'PENDING'
          ? 'PROVIDER_PENDING'
          : nextStatus === 'SUCCEEDED' ||
              nextStatus === 'FAILED' ||
              nextStatus === 'MANUAL_RECONCILIATION'
            ? nextStatus
            : 'MANUAL_RECONCILIATION',
      fromStatus: operation.status,
      toStatus: nextStatus,
      providerReference,
      reason: result.errorCode,
      metadata: {
        providerEventId: result.providerEventId ?? null,
        providerStatus: result.status,
      },
    });
    return operation.kind === 'refund'
      ? tx.refundRequest.findUniqueOrThrow({ where: { id } })
      : tx.artistPayout.findUniqueOrThrow({ where: { id } });
  });
  return current;
}

export async function reconcileRefund(
  refundId: string,
  actorId: string,
  adapter: FinancialProviderAdapter,
) {
  if (!adapter.configured) {
    throw new HttpError(503, 'Refund provider is not configured; reconciliation is unavailable.', {
      code: 'PROVIDER_UNCONFIGURED',
    });
  }
  const refund = await prisma.refundRequest.findUnique({
    where: { id: refundId },
    select: { idempotencyKey: true, providerReference: true },
  });
  if (!refund) throw new HttpError(404, 'Refund request not found.', { code: 'REFUND_NOT_FOUND' });
  const result = await adapter.reconcileRefund({
    providerReference: refund.providerReference,
    idempotencyKey: refund.idempotencyKey,
  });
  return applyReconciliationResult(refundId, 'refund', actorId, result);
}

export async function reconcilePayout(
  payoutId: string,
  actorId: string,
  adapter: FinancialProviderAdapter,
) {
  if (!adapter.configured) {
    throw new HttpError(503, 'Payout provider is not configured; reconciliation is unavailable.', {
      code: 'PROVIDER_UNCONFIGURED',
    });
  }
  const payout = await prisma.artistPayout.findUnique({
    where: { id: payoutId },
    select: { idempotencyKey: true, providerReference: true },
  });
  if (!payout)
    throw new HttpError(404, 'Payout operation not found.', { code: 'PAYOUT_NOT_FOUND' });
  const result = await adapter.reconcilePayout({
    providerReference: payout.providerReference,
    idempotencyKey: payout.idempotencyKey,
  });
  return applyReconciliationResult(payoutId, 'payout', actorId, result);
}
