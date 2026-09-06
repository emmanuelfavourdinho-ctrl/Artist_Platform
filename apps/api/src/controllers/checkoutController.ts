import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { config } from '../config/index.js';
import { HttpError } from '../lib/httpError.js';

const RESERVATION_TTL_MINUTES = 30;

interface CheckoutItemInput {
  artworkId: string;
  quantity?: number;
}

export async function createCheckoutSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const items = (req.body?.items ?? []) as CheckoutItemInput[];

    if (!Array.isArray(items) || items.length === 0) {
      throw new HttpError(400, 'Your cart is empty', { code: 'EMPTY_CART' });
    }
    for (const item of items) {
      if (!item.artworkId || typeof item.artworkId !== 'string') {
        throw new HttpError(400, 'Invalid cart item', { code: 'INVALID_ITEM' });
      }
    }

    // Merge duplicate artworkIds defensively — the client's cart is
    // never trusted, so we normalize it ourselves rather than assume
    // it arrives clean.
    const quantityByArtwork = new Map<string, number>();
    for (const item of items) {
      const qty = Math.max(1, Math.min(10, Math.floor(item.quantity ?? 1)));
      quantityByArtwork.set(item.artworkId, (quantityByArtwork.get(item.artworkId) ?? 0) + qty);
    }
    const artworkIds = [...quantityByArtwork.keys()];

    // Real price, real availability, straight from Postgres — never
    // from whatever the client's cart claims.
    const artworks = await prisma.artwork.findMany({
      where: { id: { in: artworkIds }, status: 'PUBLISHED', visibility: 'PUBLIC' },
      select: {
        id: true,
        title: true,
        price: true,
        currency: true,
        artistId: true,
        images: { where: { isPrimary: true }, take: 1, select: { url: true } },
        inventory: {
          select: { quantity: true, reservedQuantity: true, soldQuantity: true, version: true },
        },
        artist: { select: { displayName: true } },
      },
    });

    if (artworks.length !== artworkIds.length) {
      throw new HttpError(409, 'One or more items in your cart are no longer available', {
        code: 'ARTWORK_UNAVAILABLE',
      });
    }

    // Stripe requires one currency per Checkout Session — reject a
    // mixed-currency cart clearly rather than silently picking one.
    const currencies = new Set(artworks.map((a) => a.currency.toLowerCase()));
    if (currencies.size > 1) {
      throw new HttpError(
        400,
        'Items in your cart use different currencies. Please check out separately.',
        { code: 'MIXED_CURRENCY' },
      );
    }
    const currency = artworks[0]!.currency.toLowerCase();

    // Reserve inventory NOW, before the buyer even sees a payment
    // form — this is what stops two people both "winning" the last
    // copy of a one-of-a-kind piece. Reservations auto-expire if
    // checkout is abandoned.
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);
    const reservations: { id: string; artworkId: string; quantity: number }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const artwork of artworks) {
        const qty = quantityByArtwork.get(artwork.id)!;
        const inv = artwork.inventory;
        const available = inv ? inv.quantity - inv.reservedQuantity - inv.soldQuantity : 0;
        if (available < qty) {
          throw new HttpError(409, `"${artwork.title}" no longer has enough available quantity.`, {
            code: 'INSUFFICIENT_INVENTORY',
          });
        }
        // Guarded by `version` — only succeeds if the inventory row
        // hasn't changed since we read it a moment ago above.
        const updated = await tx.inventory.updateMany({
          where: { artworkId: artwork.id, version: inv!.version },
          data: { reservedQuantity: { increment: qty }, version: { increment: 1 } },
        });
        if (updated.count === 0) {
          throw new HttpError(
            409,
            `"${artwork.title}" was just reserved by someone else. Please try again.`,
            { code: 'RESERVATION_CONFLICT' },
          );
        }
        const reservation = await tx.inventoryReservation.create({
          data: { artworkId: artwork.id, userId, quantity: qty, expiresAt },
        });
        reservations.push({ id: reservation.id, artworkId: artwork.id, quantity: qty });
      }
    });

    const commissionRate = config.platformCommissionRate;

    const lineItems = artworks.map((artwork) => ({
      price_data: {
        currency,
        product_data: {
          name: artwork.title,
          images: artwork.images[0] ? [artwork.images[0].url] : undefined,
          metadata: { artworkId: artwork.id, artistId: artwork.artistId },
        },
        unit_amount: Math.round(Number(artwork.price) * 100),
      },
      quantity: quantityByArtwork.get(artwork.id)!,
    }));

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: lineItems,
        customer_email: req.user!.email,
        shipping_address_collection: {
          // Adjust to your real target markets.
          allowed_countries: ['US', 'CA', 'GB', 'NG'],
        },
        success_url: `${config.frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.frontendUrl}/cart`,
        metadata: {
          userId,
          commissionRate: String(commissionRate),
        },
      });
    } catch (stripeErr) {
      // If Stripe itself fails, release the reservations we just made
      // rather than leaving inventory stuck as "reserved" for 30
      // minutes over a checkout that never actually started.
      await prisma.inventoryReservation.updateMany({
        where: { id: { in: reservations.map((r) => r.id) } },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      await prisma.$transaction(
        reservations.map((r) =>
          prisma.inventory.update({
            where: { artworkId: r.artworkId },
            data: { reservedQuantity: { decrement: r.quantity } },
          }),
        ),
      );
      throw stripeErr;
    }

    // Links every reservation to this specific Stripe session, so the
    // webhook can find them all with one indexed query later.
    await prisma.inventoryReservation.updateMany({
      where: { id: { in: reservations.map((r) => r.id) } },
      data: { checkoutSessionId: session.id },
    });

    res.json({ status: 'success', data: { checkoutUrl: session.url } });
  } catch (err) {
    next(err);
  }
}
