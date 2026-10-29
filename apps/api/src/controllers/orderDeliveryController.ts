import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { createNotification } from '../services/notificationService.js';
import { recordAudit } from '../services/auditService.js';
import {
  appendDeliveryEvent,
  ensureArtistFulfillments,
  lockOrderForDelivery,
  notifyOrderParties,
  updateReleaseEligibility,
} from '../services/orderDeliveryService.js';
import type {
  ArtistDisputeResponseInput,
  CreateDeliveryDisputeInput,
  ResolveDeliveryDisputeInput,
  ShipOrderInput,
  UpdateTrackingInput,
} from '../validation/orderDelivery.js';

function idParam(req: Request, param: string): string {
  const value = req.params[param];
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, 'Invalid order id', { code: 'INVALID_ID' });
  }
  return value;
}

async function getArtistId(tx: Prisma.TransactionClient, userId: string): Promise<string> {
  const artist = await tx.artistProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!artist) throw new HttpError(403, 'Artist profile required', { code: 'ARTIST_REQUIRED' });
  return artist.id;
}

async function requireArtistOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  artistId: string,
) {
  const order = await tx.order.findFirst({
    where: { id: orderId, items: { some: { artistId } } },
    select: {
      id: true,
      status: true,
      userId: true,
      items: { select: { id: true, artistId: true } },
      artistFulfillments: { where: { artistId }, select: { id: true, shippedAt: true, artistCompletionConfirmedAt: true } },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found', { code: 'ORDER_NOT_FOUND' });
  return order;
}

function publicDeliveryView(order: {
  id: string;
  orderNumber: string;
  status: string;
  releaseStatus: string;
  buyerReceivedGoodAt: Date | null;
  artistResponseDeadline: Date | null;
  releaseEligibleAt: Date | null;
  releaseHoldAt: Date | null;
  artistFulfillments: Array<{
    artist: { displayName: string };
    carrier: string | null;
    trackingReference: string | null;
    trackingUrl: string | null;
    shippedAt: Date | null;
    artistCompletionConfirmedAt: Date | null;
  }>;
  deliveryDisputes: Array<{
    id: string;
    status: string;
    reason: string;
    description: string;
    evidenceReferences: string[];
    resolutionNote: string | null;
    resolvedAt: Date | null;
    createdAt: Date;
  }>;
  deliveryEvents: Array<{ eventType: string; occurredAt: Date; metadata: unknown }>;
}) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    releaseStatus: order.releaseStatus,
    buyerReceivedGoodAt: order.buyerReceivedGoodAt,
    artistResponseDeadline: order.artistResponseDeadline,
    releaseEligibleAt: order.releaseEligibleAt,
    releaseHoldAt: order.releaseHoldAt,
    fulfillments: order.artistFulfillments.map((fulfillment) => ({
      artistName: fulfillment.artist.displayName,
      carrier: fulfillment.carrier,
      trackingReference: fulfillment.trackingReference,
      trackingUrl: fulfillment.trackingUrl,
      shippedAt: fulfillment.shippedAt,
      artistCompletionConfirmedAt: fulfillment.artistCompletionConfirmedAt,
    })),
    disputes: order.deliveryDisputes,
    events: order.deliveryEvents,
  };
}

export async function getBuyerOrderDelivery(req: Request, res: Response): Promise<void> {
  const orderId = idParam(req, 'orderId');
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: req.user!.id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      releaseStatus: true,
      buyerReceivedGoodAt: true,
      artistResponseDeadline: true,
      releaseEligibleAt: true,
      releaseHoldAt: true,
      artistFulfillments: {
        orderBy: { createdAt: 'asc' },
        select: {
          carrier: true,
          trackingReference: true,
          trackingUrl: true,
          shippedAt: true,
          artistCompletionConfirmedAt: true,
          artist: { select: { displayName: true } },
        },
      },
      deliveryDisputes: {
        where: { buyerId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          reason: true,
          description: true,
          evidenceReferences: true,
          resolutionNote: true,
          resolvedAt: true,
          createdAt: true,
        },
      },
      deliveryEvents: {
        orderBy: { occurredAt: 'asc' },
        select: { eventType: true, occurredAt: true, metadata: true },
      },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found', { code: 'ORDER_NOT_FOUND' });
  res.json({ status: 'success', data: publicDeliveryView(order) });
}

export async function getArtistOrderFulfillment(req: Request, res: Response): Promise<void> {
  const orderId = idParam(req, 'orderId');
  const artistId = await prisma.artistProfile.findUnique({
    where: { userId: req.user!.id },
    select: { id: true },
  });
  if (!artistId) throw new HttpError(403, 'Artist profile required', { code: 'ARTIST_REQUIRED' });
  const order = await prisma.order.findFirst({
    where: { id: orderId, items: { some: { artistId: artistId.id } } },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      buyerReceivedGoodAt: true,
      artistResponseDeadline: true,
      releaseStatus: true,
      artistFulfillments: {
        where: { artistId: artistId.id },
        select: {
          carrier: true,
          trackingReference: true,
          trackingUrl: true,
          evidenceReferences: true,
          shippedAt: true,
          artistCompletionConfirmedAt: true,
        },
      },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found', { code: 'ORDER_NOT_FOUND' });
  res.json({ status: 'success', data: order });
}

export async function listArtistOrderFulfillments(req: Request, res: Response): Promise<void> {
  const artist = await prisma.artistProfile.findUnique({
    where: { userId: req.user!.id },
    select: { id: true },
  });
  if (!artist) throw new HttpError(403, 'Artist profile required', { code: 'ARTIST_REQUIRED' });
  const fulfillments = await prisma.artistOrderFulfillment.findMany({
    where: { artistId: artist.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      orderId: true,
      carrier: true,
      trackingReference: true,
      trackingUrl: true,
      evidenceReferences: true,
      shippedAt: true,
      artistCompletionConfirmedAt: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          createdAt: true,
          buyerReceivedGoodAt: true,
          artistResponseDeadline: true,
          releaseStatus: true,
          items: {
            where: { artistId: artist.id },
            select: { id: true, titleSnapshot: true, quantity: true, unitPrice: true, currency: true },
          },
          deliveryDisputes: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              status: true,
              reason: true,
              description: true,
              evidenceReferences: true,
              artistResponse: true,
              artistEvidenceReferences: true,
              artistRespondedAt: true,
              resolutionNote: true,
              resolvedAt: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
  res.json({
    status: 'success',
    data: fulfillments.map((fulfillment) => ({
      ...fulfillment,
      order: {
        ...fulfillment.order,
        items: fulfillment.order.items.map((item) => ({
          id: item.id,
          title: item.titleSnapshot,
          quantity: item.quantity,
          price: item.unitPrice,
          currency: item.currency,
        })),
      },
    })),
  });
}

export async function listArtistDeliveryDisputes(req: Request, res: Response): Promise<void> {
  const artist = await prisma.artistProfile.findUnique({
    where: { userId: req.user!.id },
    select: { id: true },
  });
  if (!artist) throw new HttpError(403, 'Artist profile required', { code: 'ARTIST_REQUIRED' });
  const disputes = await prisma.deliveryDispute.findMany({
    where: { order: { items: { some: { artistId: artist.id } } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 50,
    select: {
      id: true,
      status: true,
      reason: true,
      description: true,
      evidenceReferences: true,
      artistResponse: true,
      artistEvidenceReferences: true,
      artistRespondedAt: true,
      resolutionNote: true,
      resolvedAt: true,
      createdAt: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          artistResponseDeadline: true,
          releaseStatus: true,
          items: {
            where: { artistId: artist.id },
            select: { id: true, titleSnapshot: true },
          },
          deliveryEvents: {
            orderBy: { occurredAt: 'asc' },
            select: { eventType: true, occurredAt: true },
          },
        },
      },
    },
  });
  res.json({
    status: 'success',
    data: disputes.map((dispute) => ({
      ...dispute,
      order: {
        ...dispute.order,
        items: dispute.order.items.map((item) => ({ id: item.id, title: item.titleSnapshot })),
      },
    })),
  });
}

export async function respondToArtistDeliveryDispute(req: Request, res: Response): Promise<void> {
  const disputeId = idParam(req, 'disputeId');
  const input = req.body as ArtistDisputeResponseInput;
  const result = await prisma.$transaction(async (tx) => {
    const initial = await tx.deliveryDispute.findUnique({
      where: { id: disputeId },
      select: { id: true, orderId: true },
    });
    if (!initial) throw new HttpError(404, 'Delivery dispute not found', { code: 'DISPUTE_NOT_FOUND' });
    await lockOrderForDelivery(tx, initial.orderId);
    const artistId = await getArtistId(tx, req.user!.id);
    const dispute = await tx.deliveryDispute.findFirst({
      where: {
        id: disputeId,
        orderId: initial.orderId,
        order: { items: { some: { artistId } } },
      },
      select: {
        id: true,
        orderId: true,
        status: true,
        artistResponse: true,
        artistEvidenceReferences: true,
        artistRespondedAt: true,
      },
    });
    if (!dispute) throw new HttpError(404, 'Delivery dispute not found', { code: 'DISPUTE_NOT_FOUND' });
    if (dispute.artistRespondedAt) {
      if (
        dispute.artistResponse === input.response &&
        JSON.stringify(dispute.artistEvidenceReferences) === JSON.stringify(input.evidenceReferences)
      ) {
        return { id: dispute.id, respondedAt: dispute.artistRespondedAt, duplicate: true };
      }
      throw new HttpError(409, 'An artist response has already been recorded for this dispute.', {
        code: 'DISPUTE_RESPONSE_ALREADY_RECORDED',
      });
    }
    if (dispute.status !== 'OPEN') {
      throw new HttpError(409, 'Only an open dispute can receive an artist response.', {
        code: 'DISPUTE_CLOSED',
      });
    }
    const now = new Date();
    const updated = await tx.deliveryDispute.updateMany({
      where: { id: dispute.id, status: 'OPEN', artistRespondedAt: null },
      data: {
        artistResponse: input.response,
        artistEvidenceReferences: input.evidenceReferences,
        artistRespondedAt: now,
      },
    });
    if (updated.count !== 1) {
      throw new HttpError(409, 'Dispute response was submitted concurrently.', {
        code: 'STATE_CONFLICT',
      });
    }
    await appendDeliveryEvent(tx, {
      orderId: dispute.orderId,
      actorId: req.user!.id,
      eventType: 'ARTIST_DISPUTE_RESPONSE_SUBMITTED',
      metadata: { disputeId: dispute.id, evidenceReferenceCount: input.evidenceReferences.length },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'DeliveryDispute',
      entityId: dispute.id,
      reason: 'Artist submitted a response to a delivery dispute.',
      metadata: { orderId: dispute.orderId, disputeStatus: 'OPEN', evidenceReferenceCount: input.evidenceReferences.length },
    });
    await notifyOrderParties(tx, dispute.orderId, {
      type: 'ARTIST_DELIVERY_DISPUTE_RESPONSE',
      title: 'Artist responded to the delivery issue',
      message: 'The artist submitted a response and any referenced evidence. The dispute remains open pending review.',
      link: '/studio/support',
    });
    return { id: dispute.id, respondedAt: now, duplicate: false };
  });
  res.status(result.duplicate ? 200 : 201).json({ status: 'success', data: result });
}

export async function shipArtistOrder(req: Request, res: Response): Promise<void> {
  const orderId = idParam(req, 'orderId');
  const input = req.body as ShipOrderInput;
  const result = await prisma.$transaction(async (tx) => {
    const artistId = await getArtistId(tx, req.user!.id);
    await lockOrderForDelivery(tx, orderId);
    const order = await requireArtistOrder(tx, orderId, artistId);
    if (!['CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(order.status)) {
      throw new HttpError(409, 'Order is not eligible for shipment', { code: 'INVALID_ORDER_STATE' });
    }
    await ensureArtistFulfillments(
      tx,
      orderId,
      order.items.flatMap((item) => item.artistId ? [item.artistId] : []),
    );
    const fulfillment = await tx.artistOrderFulfillment.findUniqueOrThrow({
      where: { orderId_artistId: { orderId, artistId } },
    });
    if (fulfillment.shippedAt) {
      throw new HttpError(409, 'Shipment already submitted; use the audited tracking correction endpoint', {
        code: 'SHIPMENT_ALREADY_RECORDED',
      });
    }
    const now = new Date();
    const updated = await tx.artistOrderFulfillment.updateMany({
      where: { id: fulfillment.id, shippedAt: null },
      data: {
        carrier: input.carrier,
        trackingReference: input.trackingReference,
        trackingUrl: input.trackingUrl ?? null,
        evidenceReferences: input.evidenceReferences,
        shippedAt: now,
      },
    });
    if (updated.count !== 1) {
      throw new HttpError(409, 'Shipment was updated concurrently', { code: 'STATE_CONFLICT' });
    }
    const remaining = await tx.artistOrderFulfillment.count({
      where: { orderId, shippedAt: null },
    });
    if (remaining === 0) {
      await tx.order.updateMany({
        where: { id: orderId, status: { in: ['CONFIRMED', 'PROCESSING'] } },
        data: { status: 'SHIPPED' },
      });
    }
    await appendDeliveryEvent(tx, {
      orderId,
      actorId: req.user!.id,
      eventType: 'SHIPPED',
      metadata: {
        artistId,
        carrier: input.carrier,
        trackingReference: input.trackingReference,
        trackingUrl: input.trackingUrl ?? null,
        evidenceReferenceCount: input.evidenceReferences.length,
      },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'ArtistOrderFulfillment',
      entityId: fulfillment.id,
      reason: 'Artist submitted shipment tracking details.',
      metadata: { orderId, artistId, event: 'SHIPPED', evidenceReferenceCount: input.evidenceReferences.length },
    });
    await notifyOrderParties(tx, orderId, {
      type: 'ORDER_SHIPPED',
      title: 'Your order has shipped',
      message: 'An artist has submitted shipment tracking information.',
      link: '/orders',
    });
    return tx.artistOrderFulfillment.findUniqueOrThrow({
      where: { orderId_artistId: { orderId, artistId } },
      select: {
        id: true, orderId: true, artistId: true, carrier: true, trackingReference: true,
        trackingUrl: true, evidenceReferences: true, shippedAt: true,
        artistCompletionConfirmedAt: true,
      },
    });
  });
  res.json({ status: 'success', data: result });
}

export async function correctArtistTracking(req: Request, res: Response): Promise<void> {
  const orderId = idParam(req, 'orderId');
  const input = req.body as UpdateTrackingInput;
  const result = await prisma.$transaction(async (tx) => {
    const artistId = await getArtistId(tx, req.user!.id);
    await lockOrderForDelivery(tx, orderId);
    const order = await requireArtistOrder(tx, orderId, artistId);
    const fulfillment = order.artistFulfillments[0];
    if (!fulfillment?.shippedAt) {
      throw new HttpError(409, 'Tracking can be corrected only after shipment is recorded', {
        code: 'SHIPMENT_NOT_RECORDED',
      });
    }
    const previous = await tx.artistOrderFulfillment.findUniqueOrThrow({
      where: { orderId_artistId: { orderId, artistId } },
      select: { id: true, carrier: true, trackingReference: true, trackingUrl: true },
    });
    await tx.artistOrderFulfillment.update({
      where: { id: previous.id },
      data: {
        carrier: input.carrier,
        trackingReference: input.trackingReference,
        trackingUrl: input.trackingUrl ?? null,
        evidenceReferences: input.evidenceReferences,
      },
    });
    await appendDeliveryEvent(tx, {
      orderId,
      actorId: req.user!.id,
      eventType: 'TRACKING_UPDATED',
      metadata: {
        artistId,
        reason: input.reason,
        previousCarrier: previous.carrier,
        previousTrackingReference: previous.trackingReference,
        previousTrackingUrl: previous.trackingUrl,
        carrier: input.carrier,
        trackingReference: input.trackingReference,
        trackingUrl: input.trackingUrl ?? null,
      },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'ArtistOrderFulfillment',
      entityId: previous.id,
      reason: input.reason,
      metadata: { orderId, artistId, event: 'TRACKING_UPDATED' },
    });
    await notifyOrderParties(tx, orderId, {
      type: 'ORDER_TRACKING_UPDATED',
      title: 'Shipment tracking was updated',
      message: 'The artist corrected the shipment tracking information.',
      link: '/orders',
    });
    return tx.artistOrderFulfillment.findUniqueOrThrow({
      where: { orderId_artistId: { orderId, artistId } },
      select: {
        id: true, orderId: true, artistId: true, carrier: true, trackingReference: true,
        trackingUrl: true, evidenceReferences: true, shippedAt: true,
        artistCompletionConfirmedAt: true,
      },
    });
  });
  res.json({ status: 'success', data: result });
}

export async function confirmArtistCompletion(req: Request, res: Response): Promise<void> {
  const orderId = idParam(req, 'orderId');
  await prisma.$transaction(async (tx) => {
    const artistId = await getArtistId(tx, req.user!.id);
    await lockOrderForDelivery(tx, orderId);
    await requireArtistOrder(tx, orderId, artistId);
    const fulfillment = await tx.artistOrderFulfillment.findUnique({
      where: { orderId_artistId: { orderId, artistId } },
      select: { id: true, shippedAt: true, artistCompletionConfirmedAt: true },
    });
    if (!fulfillment?.shippedAt) {
      throw new HttpError(409, 'Shipment must be recorded before completion confirmation', {
        code: 'SHIPMENT_NOT_RECORDED',
      });
    }
    if (fulfillment.artistCompletionConfirmedAt) return;
    const now = new Date();
    const updated = await tx.artistOrderFulfillment.updateMany({
      where: { id: fulfillment.id, artistCompletionConfirmedAt: null },
      data: { artistCompletionConfirmedAt: now },
    });
    if (updated.count !== 1) return;
    await appendDeliveryEvent(tx, {
      orderId,
      actorId: req.user!.id,
      eventType: 'ARTIST_COMPLETION_CONFIRMED',
      metadata: { artistId },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'ArtistOrderFulfillment',
      entityId: fulfillment.id,
      reason: 'Artist confirmed completion; this alone does not authorize release.',
      metadata: { orderId, artistId, event: 'ARTIST_COMPLETION_CONFIRMED' },
    });
    await createNotification(tx, {
      userId: (await requireArtistOrder(tx, orderId, artistId)).userId,
      type: 'ARTIST_COMPLETION_CONFIRMED',
      title: 'Artist confirmed order completion',
      message: 'The artist marked their fulfillment complete. Buyer confirmation is still required for release eligibility.',
      link: '/orders',
      data: { orderId },
    });
    await updateReleaseEligibility(tx, orderId, now);
  });
  res.json({ status: 'success', data: { confirmed: true } });
}

export async function confirmBuyerReceipt(req: Request, res: Response): Promise<void> {
  const orderId = idParam(req, 'orderId');
  const result = await prisma.$transaction(async (tx) => {
    let order = await tx.order.findFirst({
      where: { id: orderId, userId: req.user!.id },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        buyerReceivedGoodAt: true,
        artistFulfillments: { select: { shippedAt: true } },
      },
    });
    if (!order) throw new HttpError(404, 'Order not found', { code: 'ORDER_NOT_FOUND' });
    await lockOrderForDelivery(tx, orderId);
    order = await tx.order.findFirst({
      where: { id: orderId, userId: req.user!.id },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        buyerReceivedGoodAt: true,
        artistFulfillments: { select: { shippedAt: true } },
      },
    });
    if (!order) throw new HttpError(404, 'Order not found', { code: 'ORDER_NOT_FOUND' });
    if (!['SHIPPED', 'DELIVERED'].includes(order.status) ||
        order.artistFulfillments.length === 0 ||
        order.artistFulfillments.some((fulfillment) => !fulfillment.shippedAt)) {
      throw new HttpError(409, 'All order shipments must be recorded before confirming receipt', {
        code: 'SHIPMENT_NOT_COMPLETE',
      });
    }
    if (order.buyerReceivedGoodAt) {
      const current = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { buyerReceivedGoodAt: true, artistResponseDeadline: true, releaseStatus: true, releaseEligibleAt: true },
      });
      return current;
    }
    const now = new Date();
    const deadline = new Date(now.getTime() + 48 * 60 * 60 * 1_000);
    const updated = await tx.order.updateMany({
      where: {
        id: orderId,
        userId: req.user!.id,
        buyerReceivedGoodAt: null,
        status: { in: ['SHIPPED', 'DELIVERED'] },
      },
      data: {
        buyerReceivedGoodAt: now,
        artistResponseDeadline: deadline,
        status: 'DELIVERED',
      },
    });
    if (updated.count !== 1) {
      throw new HttpError(409, 'Order was updated concurrently; reload its status', { code: 'STATE_CONFLICT' });
    }
    await appendDeliveryEvent(tx, {
      orderId,
      actorId: req.user!.id,
      eventType: 'BUYER_RECEIPT_CONFIRMED',
      metadata: { responseDeadline: deadline.toISOString() },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'Order',
      entityId: orderId,
      reason: 'Buyer explicitly confirmed receipt in good condition.',
      metadata: { previousStatus: order.status, newStatus: 'DELIVERED', responseDeadline: deadline.toISOString() },
    });
    await notifyOrderParties(tx, orderId, {
      type: 'BUYER_RECEIPT_CONFIRMED',
      title: 'Buyer confirmed receipt',
      message: 'The buyer confirmed receipt in good condition. The artist response window ends in 48 hours unless all artists confirm earlier.',
      link: '/orders',
    });
    await notifyOrderParties(tx, orderId, {
      type: 'ARTIST_RESPONSE_WINDOW_STARTED',
      title: '48-hour completion response window started',
      message: `The response window ends at ${deadline.toISOString()}. This is not a payout or settlement notice.`,
      link: '/orders',
    });
    await updateReleaseEligibility(tx, orderId, now);
    return tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { buyerReceivedGoodAt: true, artistResponseDeadline: true, releaseStatus: true, releaseEligibleAt: true },
    });
  });
  res.json({ status: 'success', data: result });
}

export async function createDeliveryDispute(req: Request, res: Response): Promise<void> {
  const orderId = idParam(req, 'orderId');
  const input = req.body as CreateDeliveryDisputeInput;
  const result = await prisma.$transaction(async (tx) => {
    let order = await tx.order.findFirst({
      where: { id: orderId, userId: req.user!.id },
      select: { id: true, status: true },
    });
    if (!order) throw new HttpError(404, 'Order not found', { code: 'ORDER_NOT_FOUND' });
    await lockOrderForDelivery(tx, orderId);
    order = await tx.order.findFirst({
      where: { id: orderId, userId: req.user!.id },
      select: { id: true, status: true },
    });
    if (!order) throw new HttpError(404, 'Order not found', { code: 'ORDER_NOT_FOUND' });
    if (!['SHIPPED', 'DELIVERED'].includes(order.status)) {
      throw new HttpError(409, 'A delivery issue can be reported only after shipment', { code: 'INVALID_ORDER_STATE' });
    }
    const existing = await tx.deliveryDispute.findFirst({
      where: { orderId, buyerId: req.user!.id, status: 'OPEN' },
      select: { id: true },
    });
    if (existing) return { id: existing.id, duplicate: true };
    const dispute = await tx.deliveryDispute.create({
      data: {
        orderId,
        buyerId: req.user!.id,
        reason: input.reason,
        description: input.description,
        evidenceReferences: input.evidenceReferences,
      },
      select: { id: true, status: true, createdAt: true },
    });
    await appendDeliveryEvent(tx, {
      orderId,
      actorId: req.user!.id,
      eventType: 'DELIVERY_DISPUTE_OPENED',
      metadata: { disputeId: dispute.id, reason: input.reason, evidenceReferenceCount: input.evidenceReferences.length },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'DeliveryDispute',
      entityId: dispute.id,
      reason: 'Buyer opened a delivery problem report.',
      metadata: { orderId, disputeStatus: 'OPEN', evidenceReferenceCount: input.evidenceReferences.length },
    });
    await updateReleaseEligibility(tx, orderId);
    await notifyOrderParties(tx, orderId, {
      type: 'DELIVERY_DISPUTE_OPENED',
      title: 'Delivery issue reported',
      message: 'A delivery issue was reported. Automatic release eligibility is blocked while it is reviewed.',
      link: '/orders',
    });
    return { ...dispute, duplicate: false };
  });
  res.status(201).json({ status: 'success', data: result });
}

export async function resolveDeliveryDispute(req: Request, res: Response): Promise<void> {
  const disputeId = idParam(req, 'disputeId');
  const input = req.body as ResolveDeliveryDisputeInput;
  const result = await prisma.$transaction(async (tx) => {
    let dispute = await tx.deliveryDispute.findUnique({
      where: { id: disputeId },
      select: { id: true, orderId: true, status: true },
    });
    if (!dispute) throw new HttpError(404, 'Delivery dispute not found', { code: 'DISPUTE_NOT_FOUND' });
    await lockOrderForDelivery(tx, dispute.orderId);
    dispute = await tx.deliveryDispute.findUnique({
      where: { id: disputeId },
      select: { id: true, orderId: true, status: true },
    });
    if (!dispute) throw new HttpError(404, 'Delivery dispute not found', { code: 'DISPUTE_NOT_FOUND' });
    if (dispute.status !== 'OPEN') {
      throw new HttpError(409, 'Delivery dispute is already closed', { code: 'DISPUTE_CLOSED' });
    }
    const now = new Date();
    const updated = await tx.deliveryDispute.updateMany({
      where: { id: dispute.id, status: 'OPEN' },
      data: {
        status: input.status,
        resolutionNote: input.resolutionNote,
        resolvedBy: req.user!.id,
        resolvedAt: now,
      },
    });
    if (updated.count !== 1) throw new HttpError(409, 'Dispute was updated concurrently', { code: 'STATE_CONFLICT' });
    await appendDeliveryEvent(tx, {
      orderId: dispute.orderId,
      actorId: req.user!.id,
      eventType: 'DELIVERY_DISPUTE_RESOLVED',
      metadata: { disputeId: dispute.id, status: input.status },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'DeliveryDispute',
      entityId: dispute.id,
      reason: input.resolutionNote,
      metadata: { orderId: dispute.orderId, previousStatus: 'OPEN', newStatus: input.status },
    });
    await updateReleaseEligibility(tx, dispute.orderId, now);
    await notifyOrderParties(tx, dispute.orderId, {
      type: 'DELIVERY_DISPUTE_RESOLVED',
      title: 'Delivery issue reviewed',
      message: 'A delivery issue review has been completed. Check the order for its current release eligibility.',
      link: '/orders',
    });
    return { id: dispute.id, status: input.status, resolvedAt: now };
  });
  res.json({ status: 'success', data: result });
}

export async function getAdminDeliveryDispute(req: Request, res: Response): Promise<void> {
  const disputeId = idParam(req, 'disputeId');
  const dispute = await prisma.deliveryDispute.findUnique({
    where: { id: disputeId },
    select: {
      id: true,
      status: true,
      reason: true,
      description: true,
      evidenceReferences: true,
      resolutionNote: true,
      resolvedAt: true,
      createdAt: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          buyerReceivedGoodAt: true,
          artistResponseDeadline: true,
          releaseStatus: true,
          releaseHoldAt: true,
          deliveryEvents: {
            orderBy: { occurredAt: 'asc' },
            select: { eventType: true, occurredAt: true, metadata: true },
          },
          artistFulfillments: {
            select: {
              carrier: true,
              trackingReference: true,
              trackingUrl: true,
              shippedAt: true,
              artistCompletionConfirmedAt: true,
            },
          },
        },
      },
    },
  });
  if (!dispute) throw new HttpError(404, 'Delivery dispute not found', { code: 'DISPUTE_NOT_FOUND' });
  res.json({ status: 'success', data: dispute });
}

export async function setOrderReleaseHold(req: Request, res: Response): Promise<void> {
  const orderId = idParam(req, 'orderId');
  const input = req.body as { held: boolean; reason: string };
  const result = await prisma.$transaction(async (tx) => {
    await lockOrderForDelivery(tx, orderId);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, releaseHoldAt: true, releaseHoldReason: true },
    });
    if (!order) throw new HttpError(404, 'Order not found', { code: 'ORDER_NOT_FOUND' });
    const now = new Date();
    await tx.order.update({
      where: { id: orderId },
      data: {
        releaseHoldAt: input.held ? now : null,
        releaseHoldReason: input.held ? input.reason : null,
      },
    });
    await appendDeliveryEvent(tx, {
      orderId,
      actorId: req.user!.id,
      eventType: 'RELEASE_HOLD_CHANGED',
      metadata: { held: input.held, reason: input.reason },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'OrderReleaseHold',
      entityId: orderId,
      reason: input.reason,
      metadata: { held: input.held, previousHold: !!order.releaseHoldAt },
    });
    await updateReleaseEligibility(tx, orderId, now);
    await notifyOrderParties(tx, orderId, {
      type: input.held ? 'ORDER_RELEASE_BLOCKED' : 'ORDER_RELEASE_HOLD_REMOVED',
      title: input.held ? 'Payment release hold applied' : 'Payment release hold removed',
      message: input.held
        ? 'An administrative payment hold blocks release eligibility.'
        : 'An administrative hold was removed; delivery conditions are being re-evaluated.',
      link: '/orders',
    });
    return { held: input.held, releaseStatus: (await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { releaseStatus: true },
    })).releaseStatus };
  });
  res.json({ status: 'success', data: result });
}
