import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { config } from '../config/index.js';
import {
  allocateCommissionMinorUnits,
  basisPointsToRateString,
  minorUnitsToLegacyStripeDecimal,
  minorUnitsToDecimal,
  parseLegacyCommissionRate,
  roundHalfUp,
  toLegacyStripeMinorUnits,
  toMinorUnits,
} from '../lib/money.js';
import { PLATFORM_COMMISSION_BASIS_POINTS } from '../lib/financialPolicy.js';
import { claimActiveReservations, releaseReservationGroup } from '../services/checkoutReservationTransitions.js';
import { ensureArtistFulfillments } from '../services/orderDeliveryService.js';

function isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function isCheckoutEvent(event: Stripe.Event): event is Stripe.Event & {
  data: { object: Stripe.Checkout.Session };
} {
  return (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  );
}

function isExpiredCheckoutEvent(event: Stripe.Event): event is Stripe.Event & {
  data: { object: Stripe.Checkout.Session };
} {
  return event.type === 'checkout.session.expired';
}

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string' || !Buffer.isBuffer(req.body)) {
    res.status(400).send('Invalid webhook request');
    return;
  }

  let event: Stripe.Event;
  try {
    // Signature verification must use the untouched request bytes. app.ts
    // mounts this route before express.json() so req.body is a Buffer here.
    event = stripe.webhooks.constructEvent(req.body, signature, config.stripeWebhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed', err);
    res.status(400).send('Invalid signature');
    return;
  }

  try {
    const duplicate = await processEvent(event);
    res.json({ received: true, ...(duplicate ? { duplicate: true } : {}) });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      try {
        // The event ledger is committed in the same transaction as
        // fulfillment, so an existing event row proves the event completed.
        const existingEvent = await prisma.webhookEvent.findUnique({
          where: { id: event.id },
          select: { id: true },
        });
        if (existingEvent) {
          res.json({ received: true, duplicate: true });
          return;
        }

        // A different valid event may describe the same Checkout Session.
        // The unique order key prevents a second fulfillment; record this
        // event as handled only after confirming the original order exists.
        if (isCheckoutEvent(event) && event.data.object.payment_status === 'paid') {
          const existingOrder = await prisma.order.findUnique({
            where: { checkoutSessionId: event.data.object.id },
            select: { id: true },
          });
          if (existingOrder) {
            await prisma.webhookEvent.create({
              data: { id: event.id, type: event.type },
            });
            res.json({ received: true, duplicate: true });
            return;
          }
        }
      } catch (recoveryError) {
        // A second uniqueness conflict means another identical delivery
        // recorded the event while this request checked for the order.
        if (isUniqueConstraintError(recoveryError)) {
          try {
            const recorded = await prisma.webhookEvent.findUnique({
              where: { id: event.id },
              select: { id: true },
            });
            if (recorded) {
              res.json({ received: true, duplicate: true });
              return;
            }
          } catch {
            // The response below remains retryable if recovery storage is down.
          }
        }
        console.error('Stripe webhook duplicate recovery failed', recoveryError);
      }
    }

    console.error('Stripe webhook processing failed', {
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : String(error),
    });
    // A non-2xx response lets Stripe retry. Failed database transactions
    // leave no completed event row, so a retry can safely repeat the work.
    res.status(500).json({ received: false, message: 'Webhook processing failed; retry requested.' });
  }
}

async function processEvent(event: Stripe.Event): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // This completed-event record participates in the same transaction as
    // all fulfillment writes. Concurrent duplicate inserts wait for the
    // winner to commit or roll back before Prisma reports a unique conflict.
    await tx.webhookEvent.create({ data: { id: event.id, type: event.type } });

    if (isCheckoutEvent(event) && event.data.object.payment_status === 'paid') {
      return fulfillCheckoutSession(
        tx,
        event.data.object,
        event.id,
        Number.isSafeInteger(event.created) ? new Date(event.created * 1_000) : null,
      );
    }
    if (event.type === 'checkout.session.completed' && event.data.object.status === 'complete') {
      await tx.checkoutIntent.updateMany({
        where: {
          OR: [
            { stripeSessionId: event.data.object.id },
            ...(event.data.object.metadata?.reservationGroupId
              ? [{ reservationGroupId: event.data.object.metadata.reservationGroupId }]
              : []),
          ],
          status: { in: ['OPEN', 'UNKNOWN', 'CREATING'] },
        },
        data: {
          status: 'COMPLETED',
          stripeSessionId: event.data.object.id,
          creationLeaseUntil: null,
          creationLeaseToken: null,
        },
      });
    }
    if (isExpiredCheckoutEvent(event)) {
      await expireCheckoutReservations(tx, event.data.object);
    }
    // Unknown valid event types have no side effects and are safely marked
    // handled by committing their event row.
    return false;
  });
}

async function expireCheckoutReservations(
  tx: Prisma.TransactionClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const reservations = await tx.inventoryReservation.findMany({
    where: {
      OR: [
        { checkoutSessionId: session.id },
        ...(session.metadata?.reservationGroupId
          ? [{ checkoutReservationGroupId: session.metadata.reservationGroupId }]
          : []),
      ],
    },
    select: { id: true, artworkId: true, quantity: true, status: true },
  });
  const releaseResult = await releaseReservationGroup(tx, reservations, 'EXPIRED');
  if (releaseResult === 'already-converted') return;
  await tx.checkoutIntent.updateMany({
    where: {
      OR: [
        { stripeSessionId: session.id },
        ...(session.metadata?.reservationGroupId
          ? [{ reservationGroupId: session.metadata.reservationGroupId }]
          : []),
      ],
      status: { in: ['OPEN', 'COMPLETED', 'UNKNOWN', 'CREATING', 'RECONCILIATION_REQUIRED'] },
    },
    data: { status: 'EXPIRED', checkoutUrl: null, creationLeaseUntil: null, creationLeaseToken: null, lastError: null },
  });
}

async function fulfillCheckoutSession(
  tx: Prisma.TransactionClient,
  session: Stripe.Checkout.Session,
  sourceEventId: string,
  occurredAt: Date | null,
): Promise<boolean> {
  const existingOrder = await tx.order.findUnique({
    where: { checkoutSessionId: session.id },
    select: { id: true },
  });
  if (existingOrder) return true;

  const userId = session.metadata?.userId;
  const commissionPolicy = getSessionCommissionPolicy(session.metadata);
  if (!userId || !commissionPolicy) {
    throw new Error(`Checkout session ${session.id} has invalid fulfillment metadata`);
  }

  const reservations = await tx.inventoryReservation.findMany({
    where: {
      OR: [
        { checkoutSessionId: session.id },
        ...(session.metadata?.reservationGroupId
          ? [{ checkoutReservationGroupId: session.metadata.reservationGroupId }]
          : []),
      ],
    },
    include: {
      artwork: {
        select: {
          id: true,
          title: true,
          price: true,
          currency: true,
          artistId: true,
          artist: { select: { displayName: true } },
        },
      },
    },
  });

  if (reservations.length === 0) {
    throw new Error(`No reservations found for checkout session ${session.id}`);
  }
  if (reservations.some((reservation) => reservation.status !== 'ACTIVE')) {
    throw new Error(`Checkout session ${session.id} no longer owns all active reservations`);
  }

  const currencies = new Set(reservations.map((reservation) => reservation.artwork.currency.toLowerCase()));
  const currency = reservations[0]!.artwork.currency.toLowerCase();
  if (currencies.size !== 1 || session.currency?.toLowerCase() !== currency) {
    throw new Error(`Checkout session ${session.id} currency does not match its reservations`);
  }

  const commissionLines = reservations.map((reservation) => ({
    id: reservation.id,
    subtotalMinor:
      (commissionPolicy.kind === 'legacy'
        ? toLegacyStripeMinorUnits(reservation.artwork.price, currency)
        : toMinorUnits(reservation.artwork.price, currency)) * BigInt(reservation.quantity),
  }));
  const subtotalMinor = commissionLines.reduce((sum, line) => sum + line.subtotalMinor, 0n);
  if (
    subtotalMinor > BigInt(Number.MAX_SAFE_INTEGER) ||
    session.amount_total === null ||
    !Number.isSafeInteger(session.amount_total) ||
    BigInt(session.amount_total) !== subtotalMinor
  ) {
    throw new Error(`Checkout session ${session.id} amount does not match its reservations`);
  }

  if (reservations.some((reservation) => reservation.userId !== userId)) {
    throw new Error(`Checkout session ${session.id} reservations do not match its buyer`);
  }

  const verifiedAmountMinor = BigInt(session.amount_total);
  await claimActiveReservations(tx, reservations, 'CONVERTED');

  // New-policy sessions use aggregate order rounding and deterministic
  // allocation. Legacy sessions retain their original per-item rounding.
  const commission = commissionPolicy.kind === 'fixed'
    ? allocateCommissionMinorUnits(commissionLines, commissionPolicy.basisPoints)
    : null;
  const shipping = (session as any).shipping_details ?? session.customer_details ?? {};
  const billing = session.customer_details ?? {};
  const legacyAmount = (amountMinor: bigint) =>
    commissionPolicy.kind === 'legacy'
      ? minorUnitsToLegacyStripeDecimal(amountMinor, currency)
      : minorUnitsToDecimal(amountMinor, currency);
  const subtotal = legacyAmount(subtotalMinor);
  const currencyCode = currency.toUpperCase();

  const order = await tx.order.create({
    data: {
      userId,
      orderNumber: `ART-${Date.now().toString().slice(-6)}${Math.floor(1000 + Math.random() * 9000)}`,
      checkoutSessionId: session.id,
      status: 'CONFIRMED',
      subtotal,
      totalAmount: subtotal,
      currency: currencyCode,
      shippingAddressSnapshot: shipping as object,
      billingAddressSnapshot: billing as object,
      items: {
        create: reservations.map((reservation) => {
          const lineSubtotalMinor = commissionLines.find((line) => line.id === reservation.id)!.subtotalMinor;
          const commissionAmountMinor = commissionPolicy.kind === 'fixed'
            ? commission!.byLineId.get(reservation.id)!
            : roundHalfUp(
                lineSubtotalMinor * commissionPolicy.numerator,
                commissionPolicy.denominator,
              );
          const rateSnapshot = commissionPolicy.kind === 'fixed'
            ? basisPointsToRateString(commissionPolicy.basisPoints)
            : commissionPolicy.snapshot;
          return {
            artworkId: reservation.artwork.id,
            artistId: reservation.artwork.artistId,
            titleSnapshot: reservation.artwork.title,
            artistNameSnapshot: reservation.artwork.artist.displayName,
            unitPrice: reservation.artwork.price,
            quantity: reservation.quantity,
            currency: reservation.artwork.currency.toUpperCase(),
            subtotal: legacyAmount(lineSubtotalMinor),
            commissionRate: rateSnapshot,
            commissionAmount: legacyAmount(commissionAmountMinor),
          };
        }),
      },
      payments: {
        create: {
          provider: 'stripe',
          providerPaymentId:
            typeof session.payment_intent === 'string' ? session.payment_intent : session.id,
          amount: subtotal,
          currency: currencyCode,
          status: 'SUCCEEDED',
          paidAt: new Date(),
        },
      },
    },
  });
  await ensureArtistFulfillments(
    tx,
    order.id,
    reservations.map((reservation) => reservation.artwork.artistId),
  );

  const providerObjectReference =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.id;
  const payment = await tx.payment.findFirst({
    where: { orderId: order.id, provider: 'stripe', providerPaymentId: providerObjectReference },
    select: { id: true },
  });
  if (!payment) {
    throw new Error(`Checkout session ${session.id} payment record was not created`);
  }
  await tx.financialActivity.create({
    data: {
      movementIdentifier: `stripe:checkout-payment-confirmed:${providerObjectReference}`,
      movementType: 'CHECKOUT_PAYMENT_CONFIRMED',
      amountMinorUnits: verifiedAmountMinor,
      currency: currencyCode,
      provider: 'stripe',
      providerObjectReference,
      orderId: order.id,
      paymentId: payment.id,
      occurredAt,
      sourceEventId,
      checkoutSessionId: session.id,
    },
  });

  for (const reservation of reservations) {
    const linked = await tx.inventoryReservation.updateMany({
      where: { id: reservation.id, status: 'CONVERTED', orderId: null },
      data: { orderId: order.id, checkoutSessionId: session.id },
    });
    if (linked.count !== 1) {
      throw new Error(`Could not link checkout reservation ${reservation.id} to its order`);
    }
    await tx.inventory.update({
      where: { artworkId: reservation.artwork.id },
      data: {
        soldQuantity: { increment: reservation.quantity },
        reservedQuantity: { decrement: reservation.quantity },
      },
    });
  }
  const intentTransition = await tx.checkoutIntent.updateMany({
    where: {
      OR: [
        { stripeSessionId: session.id },
        ...(session.metadata?.reservationGroupId
          ? [{ reservationGroupId: session.metadata.reservationGroupId }]
          : []),
      ],
      status: { in: ['OPEN', 'COMPLETED', 'UNKNOWN', 'CREATING', 'RECONCILIATION_REQUIRED'] },
    },
    data: {
      status: 'PAID',
      stripeSessionId: session.id,
      checkoutUrl: null,
      creationLeaseUntil: null,
      creationLeaseToken: null,
      lastError: null,
    },
  });
  if (session.metadata?.reservationGroupId && intentTransition.count !== 1) {
    throw new Error(`Checkout intent for paid session ${session.id} is not in a fulfillable state`);
  }
  return false;
}

/**
 * New sessions carry the fixed basis-point policy. Older signed Stripe
 * sessions keep the rate snapshot supplied by the server when they were
 * created, including the historical 15% default; no environment/client rate
 * is consulted while fulfilling an event.
 */
type SessionCommissionPolicy =
  | { kind: 'fixed'; basisPoints: number }
  | { kind: 'legacy'; numerator: bigint; denominator: bigint; snapshot: string };

function getSessionCommissionPolicy(metadata: Stripe.Metadata | null): SessionCommissionPolicy | null {
  if (!metadata) return null;
  if (metadata.commissionRateBps !== undefined) {
    return metadata.commissionRateBps === String(PLATFORM_COMMISSION_BASIS_POINTS)
      ? { kind: 'fixed', basisPoints: PLATFORM_COMMISSION_BASIS_POINTS }
      : null;
  }
  const legacyRate = metadata.commissionRate;
  if (!legacyRate) return null;
  const parsed = parseLegacyCommissionRate(legacyRate);
  return parsed ? { kind: 'legacy', ...parsed } : null;
}
