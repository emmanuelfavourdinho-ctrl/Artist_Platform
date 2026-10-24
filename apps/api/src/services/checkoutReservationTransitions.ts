import type { Prisma } from '@prisma/client';

export type CheckoutReservation = {
  id: string;
  artworkId: string;
  quantity: number;
  status: 'ACTIVE' | 'EXPIRED' | 'RELEASED' | 'CONVERTED';
};

export class ReservationTransitionConflict extends Error {
  constructor(message = 'Checkout reservations changed before the operation could complete.') {
    super(message);
    this.name = 'ReservationTransitionConflict';
  }
}

export async function claimActiveReservations(
  tx: Prisma.TransactionClient,
  reservations: CheckoutReservation[],
  status: 'EXPIRED' | 'RELEASED' | 'CONVERTED',
): Promise<void> {
  if (reservations.length === 0 || reservations.some((reservation) => reservation.status !== 'ACTIVE')) {
    throw new ReservationTransitionConflict();
  }

  const claimed = await tx.inventoryReservation.updateMany({
    where: { id: { in: reservations.map((reservation) => reservation.id) }, status: 'ACTIVE' },
    data: {
      status,
      ...(status === 'CONVERTED' ? {} : { releasedAt: new Date() }),
    },
  });

  if (claimed.count !== reservations.length) {
    throw new ReservationTransitionConflict();
  }
}

export async function releaseReservationGroup(
  tx: Prisma.TransactionClient,
  reservations: CheckoutReservation[],
  status: 'EXPIRED' | 'RELEASED',
): Promise<'released' | 'already-released' | 'already-converted'> {
  if (reservations.length === 0) return 'already-released';

  if (reservations.every((reservation) => reservation.status === 'CONVERTED')) {
    return 'already-converted';
  }
  if (reservations.every((reservation) => reservation.status === status)) {
    return 'already-released';
  }
  if (
    reservations.every((reservation) => reservation.status === 'EXPIRED') ||
    reservations.every((reservation) => reservation.status === 'RELEASED')
  ) {
    return 'already-released';
  }

  await claimActiveReservations(tx, reservations, status);
  for (const reservation of reservations) {
    await tx.inventory.update({
      where: { artworkId: reservation.artworkId },
      data: { reservedQuantity: { decrement: reservation.quantity } },
    });
  }
  return 'released';
}
