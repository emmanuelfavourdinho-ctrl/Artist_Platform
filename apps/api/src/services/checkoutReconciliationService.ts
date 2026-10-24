import type Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { releaseReservationGroup, ReservationTransitionConflict } from './checkoutReservationTransitions.js';
import { randomUUID } from 'node:crypto';

const IDEMPOTENCY_RETENTION_SAFE_MS = 23 * 60 * 60 * 1000;
const CREATION_LEASE_MS = 2 * 60 * 1000;
const STALE_AFTER_MS = 2 * 60 * 1000;

export interface CheckoutReconciliationResult {
  examined: number;
  recovered: number;
  released: number;
  protected: number;
  failed: number;
}

/**
 * Explicitly invoked maintenance operation. Schedule this from an authenticated
 * operations runner before production; the repository currently has no job scheduler.
 */
export async function reconcileCheckoutIntents(
  options: { now?: Date; limit?: number } = {},
): Promise<CheckoutReconciliationResult> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 250);
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  const intents = await prisma.checkoutIntent.findMany({
    where: {
      OR: [
        { status: { in: ['READY', 'UNKNOWN'] }, updatedAt: { lte: staleBefore } },
        { status: 'CREATING', creationLeaseUntil: { lte: now } },
        { status: { in: ['OPEN', 'COMPLETED'] }, updatedAt: { lte: staleBefore } },
        { status: 'RECONCILIATION_REQUIRED', stripeSessionId: { not: null }, updatedAt: { lte: staleBefore } },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  const result: CheckoutReconciliationResult = {
    examined: intents.length,
    recovered: 0,
    released: 0,
    protected: 0,
    failed: 0,
  };

  for (const intent of intents) {
    try {
      if (intent.stripeSessionId) {
        const session = await stripe.checkout.sessions.retrieve(intent.stripeSessionId);
        if (session.status === 'expired') {
          if (await expireIntent(intent.id)) result.released += 1;
          else result.protected += 1;
          continue;
        }
        if (session.status === 'complete') {
          await prisma.checkoutIntent.updateMany({
            where: { id: intent.id, status: { in: ['OPEN', 'COMPLETED', 'UNKNOWN', 'CREATING', 'RECONCILIATION_REQUIRED'] } },
            data: { status: 'COMPLETED', checkoutUrl: null, creationLeaseUntil: null, creationLeaseToken: null, lastError: null },
          });
          result.protected += 1;
          continue;
        }
        if (session.status === 'open' && session.expires_at * 1000 <= now.getTime()) {
          const expired = await stripe.checkout.sessions.expire(intent.stripeSessionId);
          if (expired.status !== 'expired') {
            await recordRetryableFailure(intent.id, 'Provider did not confirm Checkout Session expiration.');
            result.protected += 1;
            continue;
          }
          if (await expireIntent(intent.id)) result.released += 1;
          else result.protected += 1;
          continue;
        }
        // An open, unexpired checkout can still be paid. Keep its inventory reserved.
        await prisma.checkoutIntent.updateMany({
          where: { id: intent.id, status: { in: ['OPEN', 'UNKNOWN', 'CREATING', 'RECONCILIATION_REQUIRED'] } },
          data: {
            status: 'OPEN',
            checkoutUrl: session.url,
            providerExpiresAt: new Date(session.expires_at * 1000),
            creationLeaseUntil: null,
            creationLeaseToken: null,
            lastError: null,
          },
        });
        result.protected += 1;
        continue;
      }

      const leaseToken = randomUUID();
      const claimed = await prisma.checkoutIntent.updateMany({
        where: {
          id: intent.id,
          OR: [
            { status: 'READY' },
            { status: 'UNKNOWN' },
            { status: 'CREATING', creationLeaseUntil: { lte: now } },
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
        result.protected += 1;
        continue;
      }

      if (intent.createdAt.getTime() <= now.getTime() - IDEMPOTENCY_RETENTION_SAFE_MS) {
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
            lastError: 'Provider idempotency replay window elapsed with no known Checkout Session.',
          },
        });
        result.protected += 1;
        continue;
      }

      try {
        // Same persisted parameters and key: this is a safe replay, not a new session intent.
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
        result.recovered += 1;
      } catch (error) {
        if (isDefinitiveStripeFailure(error)) {
          const failed = await failOwnedIntentAndRelease(intent.id, leaseToken, safeMessage(error));
          if (failed) result.released += 1;
          else result.protected += 1;
        } else {
          const updated = await flagOwnedIntent(intent.id, leaseToken, safeMessage(error), 'UNKNOWN');
          if (updated) result.failed += 1;
          else result.protected += 1;
        }
      }
    } catch (error) {
      await recordRetryableFailure(intent.id, safeMessage(error)).catch(() => undefined);
      result.failed += 1;
    }
  }
  return result;
}

async function expireIntent(intentId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const reservations = await tx.inventoryReservation.findMany({
      where: { checkoutIntentId: intentId },
      select: { id: true, artworkId: true, quantity: true, status: true },
    });
    const outcome = await releaseReservationGroup(tx, reservations, 'EXPIRED');
    if (outcome === 'already-converted') return false;
    await tx.checkoutIntent.updateMany({
      where: { id: intentId, status: { in: ['OPEN', 'COMPLETED', 'UNKNOWN', 'CREATING', 'RECONCILIATION_REQUIRED'] } },
      data: { status: 'EXPIRED', checkoutUrl: null, creationLeaseUntil: null, creationLeaseToken: null, lastError: null },
    });
    return true;
  });
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

async function flagOwnedIntent(
  intentId: string,
  leaseToken: string,
  message: string,
  status: 'UNKNOWN' | 'RECONCILIATION_REQUIRED',
): Promise<boolean> {
  const updated = await prisma.checkoutIntent.updateMany({
    where: { id: intentId, status: 'CREATING', creationLeaseToken: leaseToken, creationLeaseUntil: { gt: new Date() } },
    data: { status, creationLeaseUntil: null, creationLeaseToken: null, lastError: message.slice(0, 500) },
  });
  return updated.count === 1;
}

async function recordRetryableFailure(intentId: string, message: string): Promise<void> {
  await prisma.checkoutIntent.updateMany({
    where: { id: intentId, status: { in: ['OPEN', 'COMPLETED', 'UNKNOWN', 'CREATING', 'RECONCILIATION_REQUIRED'] } },
    data: { lastError: message.slice(0, 500) },
  });
}

function isDefinitiveStripeFailure(error: unknown): boolean {
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

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown provider or database error';
}
