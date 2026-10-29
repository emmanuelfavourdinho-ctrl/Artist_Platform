import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { config } from '../config/index.js';
import { HttpError } from '../lib/httpError.js';
import { PLATFORM_COMMISSION_BASIS_POINTS } from '../lib/financialPolicy.js';
import { toStripeMinorUnits } from '../lib/stripeMoney.js';
import { releaseReservationGroup, ReservationTransitionConflict } from '../services/checkoutReservationTransitions.js';

const RESERVATION_TTL_MINUTES = 30;
const STRIPE_IDEMPOTENCY_SAFE_WINDOW_MS = 23 * 60 * 60 * 1000;
const CREATION_LEASE_MS = 2 * 60 * 1000;

interface CheckoutItemInput {
  artworkId: string;
  quantity?: number;
}

function isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function hasDefinitiveStripeRejection(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    error.statusCode >= 400 &&
    error.statusCode < 500 &&
    error.statusCode !== 409 &&
    error.statusCode !== 429
  );
}

function intentConflict(message: string, code: string): HttpError {
  return new HttpError(409, message, { code });
}

function checkoutUrl(intent: { status: string; checkoutUrl: string | null }): string | null {
  return intent.status === 'OPEN' ? intent.checkoutUrl : null;
}

function intentContainsOnlyUsdListings(intent: { providerRequest: unknown }): boolean {
  const request = intent.providerRequest as {
    line_items?: { price_data?: { currency?: string } }[];
  };
  return Boolean(
    request?.line_items?.length &&
      request.line_items.every((item) => item.price_data?.currency?.toLowerCase() === 'usd'),
  );
}

export async function createCheckoutSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const idempotencyKey = req.get('Idempotency-Key')?.trim();
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 255) {
      throw new HttpError(400, 'A valid Idempotency-Key header is required.', {
        code: 'INVALID_IDEMPOTENCY_KEY',
      });
    }

    const quantityByArtwork = normalizeCart(req.body?.items);
    const cartFingerprint = createHash('sha256')
      .update(JSON.stringify([...quantityByArtwork.entries()].sort(([a], [b]) => a.localeCompare(b))))
      .digest('hex');

    let intent = await prisma.checkoutIntent.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });
    if (intent) {
      if (intent.cartFingerprint !== cartFingerprint) {
        throw intentConflict(
          'This checkout key was already used for a different cart. Start a new checkout attempt.',
          'IDEMPOTENCY_KEY_REUSED',
        );
      }
      if (
        ['READY', 'CREATING', 'UNKNOWN', 'OPEN', 'COMPLETED', 'RECONCILIATION_REQUIRED'].includes(intent.status) &&
        !intentContainsOnlyUsdListings(intent)
      ) {
        throw new HttpError(409, 'This older checkout contains a listing whose USD price has not been verified.', {
          code: 'LISTING_PRICE_UNVERIFIED',
        });
      }
      if (intent.status === 'OPEN' && intent.providerExpiresAt && intent.providerExpiresAt <= new Date()) {
        throw new HttpError(503, 'This checkout session is being checked for expiration. Retry shortly.', {
          code: 'CHECKOUT_RECONCILIATION_PENDING',
        });
      }
      const url = checkoutUrl(intent);
      if (url) {
        res.json({ status: 'success', data: { checkoutUrl: url, reused: true } });
        return;
      }
      if (intent.status === 'PAID') {
        throw intentConflict('This checkout has already been paid. Start a new checkout attempt.', 'CHECKOUT_ALREADY_PAID');
      }
      if (intent.status === 'COMPLETED') {
        throw intentConflict('This checkout is already complete or awaiting payment confirmation.', 'CHECKOUT_ALREADY_COMPLETED');
      }
      if (intent.status === 'EXPIRED' || intent.status === 'FAILED') {
        throw intentConflict('This checkout attempt has ended. Start a new checkout attempt.', 'CHECKOUT_INTENT_TERMINAL');
      }
      if (intent.status === 'RECONCILIATION_REQUIRED') {
        throw new HttpError(503, 'This checkout is being reconciled. Please retry later.', {
          code: 'CHECKOUT_RECONCILIATION_PENDING',
        });
      }
    } else {
      const artworkIds = [...quantityByArtwork.keys()];
      const artworks = await prisma.artwork.findMany({
        where: {
          id: { in: artworkIds },
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          artist: { is: { verificationStatus: 'VERIFIED' } },
        },
        select: {
          id: true,
          title: true,
          price: true,
          currency: true,
          artistId: true,
          images: { where: { isPrimary: true }, take: 1, select: { url: true } },
          inventory: { select: { quantity: true, reservedQuantity: true, soldQuantity: true, version: true } },
          artist: { select: { displayName: true } },
        },
      });

      if (artworks.length !== artworkIds.length) {
        throw new HttpError(409, 'One or more items in your cart are no longer available', {
          code: 'ARTWORK_UNAVAILABLE',
        });
      }

      if (artworks.some((artwork) => artwork.currency.toUpperCase() !== 'USD')) {
        throw new HttpError(409, 'This artwork is unavailable until its USD listing price is verified.', {
          code: 'LISTING_PRICE_UNVERIFIED',
        });
      }

      const currencies = new Set(artworks.map((artwork) => artwork.currency.toLowerCase()));
      if (currencies.size > 1) {
        throw new HttpError(400, 'Items in your cart use different currencies. Please check out separately.', {
          code: 'MIXED_CURRENCY',
        });
      }

      const currency = artworks[0]!.currency.toLowerCase();
      const reservationGroupId = randomUUID();
      const id = randomUUID();
      const providerRequest: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: artworks.map((artwork) => ({
          price_data: {
            currency,
            product_data: {
              name: artwork.title,
              images: artwork.images[0] ? [artwork.images[0].url] : undefined,
              metadata: { artworkId: artwork.id, artistId: artwork.artistId },
            },
            unit_amount: toStripeMinorUnits(artwork.price, currency),
          },
          quantity: quantityByArtwork.get(artwork.id)!,
        })),
        customer_email: req.user!.email,
        shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'NG'] },
        success_url: `${config.frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.frontendUrl}/cart`,
        metadata: {
          userId,
          commissionRateBps: String(PLATFORM_COMMISSION_BASIS_POINTS),
          reservationGroupId,
        },
      };
      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);

      try {
        intent = await prisma.$transaction(async (tx) => {
          const created = await tx.checkoutIntent.create({
            data: {
              id,
              userId,
              idempotencyKey,
              cartFingerprint,
              reservationGroupId,
              providerRequest: providerRequest as unknown as Prisma.InputJsonValue,
              status: 'READY',
            },
          });

          for (const artwork of artworks) {
            const quantity = quantityByArtwork.get(artwork.id)!;
            const inventory = artwork.inventory;
            const available = inventory ? inventory.quantity - inventory.reservedQuantity - inventory.soldQuantity : 0;
            if (available < quantity || !inventory) {
              throw new HttpError(409, `"${artwork.title}" no longer has enough available quantity.`, {
                code: 'INSUFFICIENT_INVENTORY',
              });
            }
            const reserved = await tx.inventory.updateMany({
              where: { artworkId: artwork.id, version: inventory.version },
              data: { reservedQuantity: { increment: quantity }, version: { increment: 1 } },
            });
            if (reserved.count !== 1) {
              throw new HttpError(409, `"${artwork.title}" was just reserved by someone else. Please try again.`, {
                code: 'RESERVATION_CONFLICT',
              });
            }
            await tx.inventoryReservation.create({
              data: {
                artworkId: artwork.id,
                userId,
                quantity,
                expiresAt,
                checkoutReservationGroupId: reservationGroupId,
                checkoutIntentId: created.id,
              },
            });
          }
          return created;
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        intent = await prisma.checkoutIntent.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
        });
        if (!intent) throw error;
        if (intent.cartFingerprint !== cartFingerprint) {
          throw intentConflict('This checkout key was already used for a different cart.', 'IDEMPOTENCY_KEY_REUSED');
        }
      }
    }

    if (!intent) throw new Error('Checkout intent was not created.');
    const openUrl = await createOrRecoverProviderSession(intent);
    res.json({ status: 'success', data: { checkoutUrl: openUrl, reused: intent.status !== 'READY' } });
  } catch (err) {
    next(err);
  }
}

function normalizeCart(items: unknown): Map<string, number> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, 'Your cart is empty', { code: 'EMPTY_CART' });
  }
  const quantities = new Map<string, number>();
  for (const item of items as CheckoutItemInput[]) {
    if (!item || typeof item.artworkId !== 'string' || !item.artworkId.trim()) {
      throw new HttpError(400, 'Invalid cart item', { code: 'INVALID_ITEM' });
    }
    const requested = item.quantity ?? 1;
    if (!Number.isInteger(requested) || requested < 1 || requested > 10) {
      throw new HttpError(400, 'Each cart quantity must be an integer from 1 to 10.', { code: 'INVALID_QUANTITY' });
    }
    quantities.set(item.artworkId, (quantities.get(item.artworkId) ?? 0) + requested);
  }
  return quantities;
}

async function createOrRecoverProviderSession(intent: any): Promise<string> {
  const now = new Date();
  const leaseToken = randomUUID();
  const claimed = await prisma.checkoutIntent.updateMany({
    where: {
      id: intent.id,
      OR: [
        { status: 'READY' },
        { status: 'UNKNOWN' },
        { status: 'CREATING', creationLeaseUntil: { lt: now } },
      ],
    },
    data: {
      status: 'CREATING',
      creationLeaseUntil: new Date(now.getTime() + CREATION_LEASE_MS),
      creationLeaseToken: leaseToken,
      lastAttemptAt: now,
      lastError: null,
    },
  });
  if (claimed.count !== 1) {
    const latest = await prisma.checkoutIntent.findUnique({ where: { id: intent.id } });
    const existingUrl = latest && checkoutUrl(latest);
    if (existingUrl) return existingUrl;
    throw new HttpError(503, 'Checkout creation is already in progress. Retry with the same Idempotency-Key.', {
      code: 'CHECKOUT_CREATION_IN_PROGRESS',
    });
  }

  if (intent.createdAt.getTime() < now.getTime() - STRIPE_IDEMPOTENCY_SAFE_WINDOW_MS) {
    await prisma.checkoutIntent.updateMany({
      where: {
        id: intent.id,
        status: 'CREATING',
        creationLeaseToken: leaseToken,
        creationLeaseUntil: { gt: new Date() },
      },
      data: {
        status: 'RECONCILIATION_REQUIRED',
        creationLeaseUntil: null,
        creationLeaseToken: null,
      },
    });
    throw new HttpError(503, 'Checkout outcome is still unknown and needs reconciliation.', {
      code: 'CHECKOUT_RECONCILIATION_PENDING',
    });
  }

  try {
    // Repeating this exact persisted request with this stable key is Stripe's
    // supported recovery path for a lost/ambiguous create response.
    const session = await stripe.checkout.sessions.create(
      intent.providerRequest as Stripe.Checkout.SessionCreateParams,
      { idempotencyKey: intent.reservationGroupId },
    );
    await prisma.$transaction(async (tx) => {
      const updatedIntent = await tx.checkoutIntent.updateMany({
        where: {
          id: intent.id,
          status: 'CREATING',
          creationLeaseToken: leaseToken,
          creationLeaseUntil: { gt: new Date() },
        },
        data: {
          status: 'OPEN',
          stripeSessionId: session.id,
          checkoutUrl: session.url,
          providerExpiresAt: new Date(session.expires_at * 1000),
          creationLeaseUntil: null,
          creationLeaseToken: null,
          lastError: null,
        },
      });
      if (updatedIntent.count === 1) {
        await tx.inventoryReservation.updateMany({
          where: { checkoutIntentId: intent.id, status: 'ACTIVE' },
          data: { checkoutSessionId: session.id },
        });
      }
    });
    if (!session.url) {
      await prisma.checkoutIntent.updateMany({
        where: { id: intent.id, status: 'OPEN', stripeSessionId: session.id },
        data: { lastError: 'Provider created a session without a hosted checkout URL.' },
      });
      throw new HttpError(503, 'The checkout session was created and is being recovered. Retry shortly.', {
        code: 'CHECKOUT_CREATION_UNKNOWN',
      });
    }
    return session.url;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown Stripe error';
    if (hasDefinitiveStripeRejection(error)) {
      const failed = await failOwnedIntentAndRelease(intent.id, leaseToken, message);
      if (!failed) {
        throw new HttpError(503, 'Checkout state changed while the provider request was in progress. Retry safely.', {
          code: 'CHECKOUT_STATE_CHANGED',
        });
      }
      throw new HttpError(502, 'The payment provider rejected checkout creation.', {
        code: 'CHECKOUT_CREATION_FAILED',
      });
    }
    await prisma.checkoutIntent.updateMany({
      where: {
        id: intent.id,
        status: 'CREATING',
        creationLeaseToken: leaseToken,
        creationLeaseUntil: { gt: new Date() },
      },
      data: { status: 'UNKNOWN', creationLeaseUntil: null, creationLeaseToken: null, lastError: message },
    }).catch(() => undefined);
    throw new HttpError(503, 'Checkout creation outcome is unknown. Retry using the same Idempotency-Key.', {
      code: 'CHECKOUT_CREATION_UNKNOWN',
    });
  }
}

async function failOwnedIntentAndRelease(intentId: string, leaseToken: string, message: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const failed = await tx.checkoutIntent.updateMany({
      where: {
        id: intentId,
        status: 'CREATING',
        creationLeaseToken: leaseToken,
        creationLeaseUntil: { gt: new Date() },
      },
      data: { status: 'FAILED', creationLeaseUntil: null, creationLeaseToken: null, lastError: message },
    });
    if (failed.count !== 1) return false;
    const reservations = await tx.inventoryReservation.findMany({
      where: { checkoutIntentId: intentId },
      select: { id: true, artworkId: true, quantity: true, status: true },
    });
    const releaseResult = await releaseReservationGroup(tx, reservations, 'RELEASED');
    if (releaseResult === 'already-converted') throw new ReservationTransitionConflict();
    return true;
  });
}
