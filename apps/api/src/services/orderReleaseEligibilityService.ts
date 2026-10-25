import { prisma } from '../lib/prisma.js';
import { updateReleaseEligibility } from './orderDeliveryService.js';

/**
 * Safe to invoke repeatedly from an external scheduled runner. The database
 * transition is conditional, so concurrent or repeated runs cannot duplicate
 * eligibility events or notifications.
 */
export async function processDueReleaseEligibility(
  now = new Date(),
  limit = 100,
): Promise<{ examined: number; eligible: number; blocked: number }> {
  const candidates = await prisma.order.findMany({
    where: {
      buyerReceivedGoodAt: { not: null },
      artistResponseDeadline: { lte: now },
      releaseStatus: { not: 'ELIGIBLE' },
    },
    orderBy: [{ artistResponseDeadline: 'asc' }, { id: 'asc' }],
    take: limit,
    select: { id: true },
  });
  let eligible = 0;
  let blocked = 0;
  for (const candidate of candidates) {
    const result = await prisma.$transaction((tx) =>
      updateReleaseEligibility(tx, candidate.id, now),
    );
    if (result === 'eligible') eligible += 1;
    if (result === 'blocked') blocked += 1;
  }
  return { examined: candidates.length, eligible, blocked };
}
