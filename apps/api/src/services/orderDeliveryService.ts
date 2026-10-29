import { Prisma, type PrismaClient } from '@prisma/client';
import { createNotification } from './notificationService.js';
import { recordAudit } from './auditService.js';

type Db = PrismaClient | Prisma.TransactionClient;

const RESPONSE_WINDOW_MS = 48 * 60 * 60 * 1_000;

export async function lockOrderForDelivery(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "Order"
    WHERE "id" = ${orderId}
    FOR UPDATE
  `);
}

export async function ensureArtistFulfillments(
  tx: Prisma.TransactionClient,
  orderId: string,
  artistIds: string[],
): Promise<void> {
  const uniqueArtistIds = [...new Set(artistIds)];
  if (!uniqueArtistIds.length) throw new Error('Order has no artist-owned items');
  await tx.artistOrderFulfillment.createMany({
    data: uniqueArtistIds.map((artistId) => ({ orderId, artistId })),
    skipDuplicates: true,
  });
}

export async function appendDeliveryEvent(
  db: Db,
  input: {
    orderId: string;
    actorId?: string | null;
    eventType: Prisma.OrderDeliveryEventCreateInput['eventType'];
    metadata?: Prisma.InputJsonValue;
  },
) {
  return db.orderDeliveryEvent.create({
    data: {
      orderId: input.orderId,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
  });
}

export async function notifyOrderParties(
  tx: Prisma.TransactionClient,
  orderId: string,
  input: { type: string; title: string; message: string; link: string },
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      userId: true,
      artistFulfillments: { select: { artist: { select: { userId: true } } } },
    },
  });
  if (!order) throw new Error('Order not found while notifying delivery parties');
  const userIds = [...new Set([
    order.userId,
    ...order.artistFulfillments.map((item) => item.artist.userId),
  ])];
  await Promise.all(userIds.map((userId) =>
    createNotification(tx, {
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link,
      data: { orderId },
    }),
  ));
}

export async function updateReleaseEligibility(
  tx: Prisma.TransactionClient,
  orderId: string,
  now = new Date(),
): Promise<'unchanged' | 'blocked' | 'eligible' | 'not_eligible'> {
  await lockOrderForDelivery(tx, orderId);
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      buyerReceivedGoodAt: true,
      artistResponseDeadline: true,
      artistResponseWindowExpiredAt: true,
      releaseEligibleAt: true,
      releaseHoldAt: true,
      releaseStatus: true,
      artistFulfillments: { select: { artistCompletionConfirmedAt: true } },
      deliveryDisputes: { where: { status: 'OPEN' }, select: { id: true }, take: 1 },
    },
  });
  if (!order || !order.buyerReceivedGoodAt || order.artistFulfillments.length === 0) {
    return 'unchanged';
  }

  const blocked = !!order.releaseHoldAt || order.deliveryDisputes.length > 0;
  const allArtistsConfirmed = order.artistFulfillments.every(
    (fulfillment) => fulfillment.artistCompletionConfirmedAt !== null,
  );
  const responseWindowExpired =
    order.artistResponseDeadline !== null && order.artistResponseDeadline <= now;
  if (responseWindowExpired && !order.artistResponseWindowExpiredAt) {
    const expiredAt = await tx.order.updateMany({
      where: { id: orderId, artistResponseWindowExpiredAt: null, artistResponseDeadline: { lte: now } },
      data: { artistResponseWindowExpiredAt: now },
    });
    if (expiredAt.count === 1) {
      await appendDeliveryEvent(tx, {
        orderId,
        eventType: 'ARTIST_RESPONSE_WINDOW_EXPIRED',
        metadata: { responseDeadline: order.artistResponseDeadline!.toISOString() },
      });
      await notifyOrderParties(tx, orderId, {
        type: 'ARTIST_RESPONSE_WINDOW_EXPIRED',
        title: 'Artist response window ended',
        message: 'The 48-hour response window has ended. Any release eligibility remains subject to disputes and payment holds.',
        link: '/orders',
      });
    }
  }
  const eligible = allArtistsConfirmed || responseWindowExpired;
  const nextStatus = blocked ? 'BLOCKED' : eligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE';
  if (order.releaseStatus === nextStatus &&
      (nextStatus !== 'ELIGIBLE' || order.releaseEligibleAt !== null)) {
    return 'unchanged';
  }

  const result = await tx.order.updateMany({
    where: {
      id: orderId,
      buyerReceivedGoodAt: { not: null },
      releaseStatus: order.releaseStatus,
      ...(order.releaseStatus === 'ELIGIBLE'
        ? { releaseEligibleAt: order.releaseEligibleAt }
        : {}),
    },
    data: {
      releaseStatus: nextStatus,
      releaseEligibleAt: nextStatus === 'ELIGIBLE' ? now : null,
    },
  });
  if (result.count !== 1) return 'unchanged';

  const type = nextStatus === 'ELIGIBLE'
    ? 'RELEASE_ELIGIBLE'
    : blocked
      ? 'RELEASE_BLOCKED'
      : 'RELEASE_UNBLOCKED';
  await appendDeliveryEvent(tx, {
    orderId,
    eventType: type,
    metadata: {
      reason: blocked ? (order.releaseHoldAt ? 'payment_hold' : 'open_delivery_dispute') :
        nextStatus === 'ELIGIBLE'
          ? allArtistsConfirmed ? 'buyer_and_artists_confirmed' : 'artist_response_window_expired'
          : 'hold_or_dispute_cleared_before_eligibility',
      releaseEligibleAt: nextStatus === 'ELIGIBLE' ? now.toISOString() : null,
    },
  });
  await recordAudit(tx, {
    actorId: null,
    action: 'ORDER_STATUS_CHANGED',
    entityType: 'OrderReleaseEligibility',
    entityId: orderId,
    reason: type === 'RELEASE_ELIGIBLE'
      ? 'Order met the configured delivery release eligibility conditions.'
      : type === 'RELEASE_BLOCKED'
        ? 'A dispute or payment hold blocks delivery release eligibility.'
        : 'A delivery hold was cleared, but the order has not met the release eligibility conditions.',
    metadata: {
      previousStatus: order.releaseStatus,
      newStatus: nextStatus,
      reason: blocked ? (order.releaseHoldAt ? 'payment_hold' : 'open_delivery_dispute') :
        nextStatus === 'ELIGIBLE'
          ? allArtistsConfirmed ? 'buyer_and_artists_confirmed' : 'artist_response_window_expired'
          : 'hold_or_dispute_cleared_before_eligibility',
    },
  });
  await notifyOrderParties(tx, orderId, {
    type: type === 'RELEASE_ELIGIBLE'
      ? 'ORDER_RELEASE_ELIGIBLE'
      : type === 'RELEASE_BLOCKED'
        ? 'ORDER_RELEASE_BLOCKED'
        : 'ORDER_RELEASE_UNBLOCKED',
    title: type === 'RELEASE_ELIGIBLE'
      ? 'Order is eligible for payment release'
      : type === 'RELEASE_BLOCKED'
        ? 'Payment release is blocked'
        : 'Payment release hold cleared',
    message: type === 'RELEASE_ELIGIBLE'
      ? 'The order met the delivery conditions for release eligibility. This does not mean a payout has been sent.'
      : type === 'RELEASE_BLOCKED'
        ? 'An active delivery dispute or payment hold prevents release eligibility.'
        : 'The hold was cleared, but the order is not yet eligible for release.',
    link: '/orders',
  });
  return nextStatus === 'ELIGIBLE' ? 'eligible' : blocked ? 'blocked' : 'not_eligible';
}

export const ARTIST_RESPONSE_WINDOW_MS = RESPONSE_WINDOW_MS;
