import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { config } from '../config/index.js';
import type Stripe from 'stripe';

function generateOrderNumber(): string {
  const random = Math.floor(1000 + Math.random() * 9000);
  return `ART-${Date.now().toString().slice(-6)}${random}`;
}

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    res.status(400).send('Missing Stripe signature');
    return;
  }

  let event: Stripe.Event;
  try {
    // req.body is the RAW, unparsed buffer here — see app.ts, this
    // route is intentionally mounted with express.raw() before the
    // global JSON parser, because Stripe's signature check needs the
    // exact original bytes, not a re-serialized JS object.
    event = stripe.webhooks.constructEvent(req.body, signature, config.stripeWebhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed', err);
    res.status(400).send('Invalid signature');
    return;
  }

  // Idempotency: try to record this event id FIRST. If it's already
  // there, the unique constraint throws, we catch it, and tell Stripe
  // "OK" without doing anything else — this is what prevents a
  // duplicate webhook delivery from creating a duplicate order.
  try {
    await prisma.webhookEvent.create({ data: { id: event.id, type: event.type } });
  } catch {
    res.json({ received: true, duplicate: true });
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      await fulfillCheckoutSession(session);
    } catch (err) {
      // Logged for a human to investigate — but still 200 to Stripe.
      // Stripe's retry mechanism is for delivery failures, not for
      // bugs on our end; retrying the same broken code path in a loop
      // helps no one.
      console.error('Failed to fulfill checkout session', session.id, err);
    }
  }

  res.json({ received: true });
}

async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId;
  const commissionRate = Number(session.metadata?.commissionRate ?? config.platformCommissionRate);
  if (!userId) throw new Error(`Checkout session ${session.id} has no userId in metadata`);

  const reservations = await prisma.inventoryReservation.findMany({
    where: { checkoutSessionId: session.id, status: 'ACTIVE' },
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
    throw new Error(`No active reservations found for session ${session.id} (may have expired)`);
  }

  const shipping = (session as any).shipping_details ?? session.customer_details ?? {};
  const billing = session.customer_details ?? {};
  const subtotal = reservations.reduce((sum, r) => sum + Number(r.artwork.price) * r.quantity, 0);
  const orderNumber = generateOrderNumber();
  const currency = reservations[0]!.artwork.currency;

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        userId,
        orderNumber,
        status: 'CONFIRMED',
        subtotal,
        totalAmount: subtotal,
        currency,
        shippingAddressSnapshot: shipping as object,
        billingAddressSnapshot: billing as object,
        items: {
          create: reservations.map((r) => {
            const lineSubtotal = Number(r.artwork.price) * r.quantity;
            const commissionAmount = Math.round(lineSubtotal * commissionRate * 100) / 100;
            return {
              artworkId: r.artwork.id,
              artistId: r.artwork.artistId,
              titleSnapshot: r.artwork.title,
              artistNameSnapshot: r.artwork.artist.displayName,
              unitPrice: r.artwork.price,
              quantity: r.quantity,
              currency: r.artwork.currency,
              subtotal: lineSubtotal,
              commissionRate,
              commissionAmount,
            };
          }),
        },
        payments: {
          create: {
            provider: 'stripe',
            providerPaymentId:
              typeof session.payment_intent === 'string' ? session.payment_intent : session.id,
            amount: subtotal,
            currency,
            status: 'SUCCEEDED',
            paidAt: new Date(),
          },
        },
      },
    });

    for (const r of reservations) {
      await tx.inventory.update({
        where: { artworkId: r.artwork.id },
        data: {
          soldQuantity: { increment: r.quantity },
          reservedQuantity: { decrement: r.quantity },
        },
      });
      await tx.inventoryReservation.update({
        where: { id: r.id },
        data: { status: 'CONVERTED', orderId: order.id },
      });
    }
  });
}
