import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  artistProfile: { findUnique: vi.fn() },
  artistPayout: { findMany: vi.fn() },
  financialActivity: { findMany: vi.fn() },
}));

vi.mock('../lib/prisma.js', () => ({ prisma: mocks }));
vi.mock('../services/financialProvider.js', () => ({
  financialProviderAdapter: { configured: false },
}));

import { getStudioEarnings } from '../controllers/studioFinanceController.js';
import { prisma } from '../lib/prisma.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ARTIST_ID = '22222222-2222-4222-8222-222222222222';

describe('artist earnings access control', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.artistProfile.findUnique).mockResolvedValue({ id: ARTIST_ID } as never);
    vi.mocked(prisma.artistPayout.findMany).mockResolvedValue([{
      id: 'payout-1',
      amountMinorUnits: 9000n,
      commissionMinorUnits: 1000n,
      currency: 'USD',
      order: { orderNumber: 'ORD-1', releaseStatus: 'ELIGIBLE', releaseEligibleAt: new Date() },
      events: [],
    }] as never);
    vi.mocked(prisma.financialActivity.findMany).mockResolvedValue([{
      id: 'activity-1',
      movementType: 'ARTIST_PAYOUT_CONFIRMED',
      amountMinorUnits: 9000n,
      currency: 'USD',
      provider: 'test-provider',
      providerObjectReference: 'provider-ref-1',
      occurredAt: null,
      recordedAt: new Date(),
      order: { orderNumber: 'ORD-1' },
    }] as never);
  });

  it('scopes payout and confirmed activity reads to the signed-in artist and serializes exact minor units', async () => {
    const json = vi.fn();
    await getStudioEarnings({ user: { id: USER_ID } } as never, { json } as never);

    expect(prisma.artistProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      select: { id: true },
    });
    expect(prisma.artistPayout.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { artistId: ARTIST_ID },
      take: 100,
      select: expect.not.objectContaining({ buyer: expect.anything(), shippingAddressSnapshot: expect.anything() }),
    }));
    expect(prisma.financialActivity.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { payout: { is: { artistId: ARTIST_ID } } },
    }));
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        providerConfigured: false,
        payouts: [expect.objectContaining({ amountMinorUnits: '9000', commissionMinorUnits: '1000' })],
        confirmedActivities: [expect.objectContaining({ amountMinorUnits: '9000' })],
      }),
    }));
  });

  it('does not query artist finance records when no artist profile belongs to the user', async () => {
    vi.mocked(prisma.artistProfile.findUnique).mockResolvedValue(null as never);

    await expect(getStudioEarnings({ user: { id: USER_ID } } as never, { json: vi.fn() } as never))
      .rejects.toMatchObject({ status: 403, code: 'ARTIST_REQUIRED' });
    expect(prisma.artistPayout.findMany).not.toHaveBeenCalled();
    expect(prisma.financialActivity.findMany).not.toHaveBeenCalled();
  });
});
