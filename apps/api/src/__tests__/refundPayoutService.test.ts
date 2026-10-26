import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    refundRequest: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    payment: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    order: { update: vi.fn() },
    artistPayout: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    artistOrderFulfillment: { findUnique: vi.fn() },
    orderItem: { findMany: vi.fn() },
    financialOperationEvent: { create: vi.fn() },
    financialActivity: { findFirst: vi.fn(), create: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(),
    recordAudit: vi.fn(),
    payoutFindUnique: vi.fn(),
    refundFindUnique: vi.fn(),
  };
});

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $transaction: mocks.transaction,
    artistPayout: { findUnique: mocks.payoutFindUnique },
    refundRequest: { findUnique: mocks.refundFindUnique },
  },
}));
vi.mock('../services/auditService.js', () => ({
  recordAudit: mocks.recordAudit,
}));

import {
  calculateArtistPayoutAmount,
  authorizeRefundRetry,
  createArtistPayout,
  authorizePayoutRetry,
  decidePayout,
  reconcilePayout,
  reconcileRefund,
  requestRefund,
  submitPayout,
} from '../services/refundPayoutService.js';
import { createFakeFinancialProviderAdapter } from '../services/testing/fakeFinancialProvider.js';

const refundInput = {
  paymentId: 'payment-1',
  amountMinorUnits: '10000',
  reason: 'Full refund requested after review',
  idempotencyKey: 'refund-request-0001',
  actorId: 'staff-1',
};

function prepareRefundRequest(reservedMinorUnits: bigint) {
  mocks.tx.refundRequest.findUnique
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null);
  mocks.tx.payment.findUnique
    .mockResolvedValueOnce({ orderId: 'order-1' })
    .mockResolvedValueOnce({
      id: 'payment-1',
      orderId: 'order-1',
      amount: { toString: () => '100.00' },
      currency: 'USD',
      status: 'SUCCEEDED',
      order: { id: 'order-1', currency: 'USD' },
    });
  mocks.tx.artistPayout.findFirst.mockResolvedValue(null);
  mocks.tx.refundRequest.aggregate.mockResolvedValue({
    _sum: { amountMinorUnits: reservedMinorUnits },
  });
  mocks.tx.refundRequest.create.mockResolvedValue({
    id: 'refund-1',
    paymentId: 'payment-1',
    orderId: 'order-1',
    amountMinorUnits: BigInt(refundInput.amountMinorUnits),
    currency: 'USD',
    status: 'REQUESTED',
  });
  mocks.tx.financialOperationEvent.create.mockResolvedValue({});
  mocks.recordAudit.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation((callback: (tx: typeof mocks.tx) => unknown) =>
    callback(mocks.tx),
  );
});

function preparePayoutAuthorization(
  orderOverrides: Record<string, unknown> = {},
  commissionAmount = '10.00',
  status = 'REQUESTED',
) {
  const eligibleOrder = {
    currency: 'USD',
    releaseStatus: 'ELIGIBLE',
    buyerReceivedGoodAt: new Date('2026-10-10T12:00:00Z'),
    releaseHoldAt: null,
    deliveryDisputes: [],
    payments: [{ id: 'payment-1', status: 'SUCCEEDED', currency: 'USD' }],
    refunds: [],
    ...orderOverrides,
  };
  mocks.tx.artistPayout.findUnique.mockResolvedValue({
    id: 'payout-1',
    orderId: 'order-1',
    requestedBy: 'requester-1',
    status,
  });
  mocks.tx.artistPayout.findUniqueOrThrow
    .mockResolvedValueOnce({
      id: 'payout-1',
      orderId: 'order-1',
      requestedBy: 'requester-1',
      status,
    })
    .mockResolvedValueOnce({
      fulfillmentId: 'fulfillment-1',
      orderId: 'order-1',
      artistId: 'artist-1',
      amountMinorUnits: 9000n,
      commissionMinorUnits: 1000n,
      currency: 'USD',
      fulfillment: { orderId: 'order-1', artistId: 'artist-1' },
      order: eligibleOrder,
    })
    .mockResolvedValueOnce({ id: 'payout-1', status: 'APPROVED' });
  mocks.tx.orderItem.findMany.mockResolvedValue([{
    currency: 'USD',
    subtotal: { toString: () => '100.00' },
    commissionAmount: { toString: () => commissionAmount },
  }]);
  mocks.tx.refundRequest.findFirst.mockResolvedValue(null);
  mocks.tx.artistPayout.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.artistPayout.update.mockResolvedValue({});
  mocks.tx.financialOperationEvent.create.mockResolvedValue({});
  mocks.recordAudit.mockResolvedValue(undefined);
}

describe('refund and payout service foundations', () => {
  it('records full and partial refunds as exact integer minor units', async () => {
    prepareRefundRequest(0n);
    const full = await requestRefund(refundInput);
    expect(full.amountMinorUnits).toBe(10000n);
    expect(mocks.tx.refundRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amountMinorUnits: 10000n, currency: 'USD' }),
    }));
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.tx.refundRequest.aggregate.mock.invocationCallOrder[0]!,
    );
    expect(mocks.tx.financialOperationEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'REQUESTED', toStatus: 'REQUESTED' }),
    }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ action: 'FINANCIAL_OPERATION_CHANGED' }),
    );

    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback: (tx: typeof mocks.tx) => unknown) =>
      callback(mocks.tx),
    );
    const partialInput = { ...refundInput, amountMinorUnits: '4000', idempotencyKey: 'refund-request-0002' };
    prepareRefundRequest(6000n);
    await requestRefund(partialInput);
    expect(mocks.tx.refundRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amountMinorUnits: 4000n, currency: 'USD' }),
    }));
  });

  it('rejects a refund that exceeds remaining captured funds after outstanding requests', async () => {
    prepareRefundRequest(6000n);
    await expect(requestRefund({
      ...refundInput,
      amountMinorUnits: '5000',
    })).rejects.toMatchObject({ status: 409, code: 'REFUND_AMOUNT_EXCEEDS_REMAINING' });
    expect(mocks.tx.refundRequest.create).not.toHaveBeenCalled();
  });

  it('does not reauthorize a failed refund after competing requests consume the remaining funds', async () => {
    mocks.tx.refundRequest.findUnique.mockResolvedValue({
      id: 'refund-1',
      paymentId: 'payment-1',
      orderId: 'order-1',
      status: 'FAILED',
    });
    mocks.tx.refundRequest.findUniqueOrThrow.mockResolvedValue({
      id: 'refund-1',
      paymentId: 'payment-1',
      amountMinorUnits: 10000n,
      currency: 'USD',
      status: 'FAILED',
    });
    mocks.tx.payment.findUniqueOrThrow.mockResolvedValue({
      amount: { toString: () => '100.00' },
      currency: 'USD',
      status: 'PARTIALLY_REFUNDED',
    });
    mocks.tx.refundRequest.aggregate.mockResolvedValue({
      _sum: { amountMinorUnits: 10000n },
    });

    await expect(authorizeRefundRetry({
      refundId: 'refund-1',
      actorId: 'staff-1',
      reason: 'Retry after definitive failure',
    })).rejects.toMatchObject({
      status: 409,
      code: 'REFUND_AMOUNT_EXCEEDS_REMAINING',
    });
    expect(mocks.tx.refundRequest.update).not.toHaveBeenCalled();
  });

  it('returns an identical idempotent request without creating a duplicate', async () => {
    const prior = {
      id: 'refund-previous',
      paymentId: refundInput.paymentId,
      amountMinorUnits: 10000n,
      reason: refundInput.reason,
      requestedBy: refundInput.actorId,
      status: 'REQUESTED',
    };
    mocks.tx.refundRequest.findUnique.mockResolvedValue(prior);

    await expect(requestRefund(refundInput)).resolves.toEqual(prior);
    expect(mocks.tx.refundRequest.create).not.toHaveBeenCalled();
    expect(mocks.tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('converts database idempotency-key collisions into safe conflicts for refunds and payouts', async () => {
    const duplicateKey = Object.assign(new Error('unique conflict'), {
      code: 'P2002',
      meta: { target: ['idempotencyKey'] },
    });
    mocks.transaction.mockRejectedValue(duplicateKey);

    await expect(requestRefund(refundInput)).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    await expect(createArtistPayout({
      fulfillmentId: 'fulfillment-1',
      idempotencyKey: 'payout-request-0001',
      actorId: 'staff-1',
    })).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('rechecks payout uniqueness under the order lock before creating an operation', async () => {
    const existing = {
      id: 'payout-existing',
      fulfillmentId: 'fulfillment-1',
      idempotencyKey: 'payout-request-0001',
      status: 'REQUESTED',
      amountMinorUnits: 9000n,
      commissionMinorUnits: 1000n,
      currency: 'USD',
    };
    mocks.tx.artistPayout.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    mocks.tx.artistOrderFulfillment.findUnique.mockResolvedValue({
      id: 'fulfillment-1',
      orderId: 'order-1',
      artistId: 'artist-1',
    });

    await expect(createArtistPayout({
      fulfillmentId: 'fulfillment-1',
      idempotencyKey: 'payout-request-0001',
      actorId: 'staff-1',
    })).resolves.toEqual(existing);

    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.artistPayout.create).not.toHaveBeenCalled();
    expect(mocks.tx.artistPayout.findUnique.mock.invocationCallOrder[2]).toBeGreaterThan(
      mocks.tx.$queryRaw.mock.invocationCallOrder[0]!,
    );
  });

  it('does not recalculate commission or deduct provider fees from stored item snapshots', () => {
    const amount = calculateArtistPayoutAmount([
      { currency: 'USD', subtotal: { toString: () => '100.00' }, commissionAmount: { toString: () => '12.50' } },
      { currency: 'USD', subtotal: { toString: () => '25.00' }, commissionAmount: { toString: () => '2.00' } },
    ], 'USD');

    expect(amount).toEqual({
      grossMinorUnits: 12500n,
      commissionMinorUnits: 1450n,
      amountMinorUnits: 11050n,
    });
  });

  it('provides deterministic fake provider responses without treating submission as success', async () => {
    const adapter = createFakeFinancialProviderAdapter();
    expect(adapter.providerName).toBe('test-only');
    const submitted = await adapter.submitPayout({
      idempotencyKey: 'payout-test-key',
      internalArtistReference: 'artist-test',
      amountMinorUnits: '9000',
      currency: 'USD',
    });
    expect(submitted).toEqual({
      accepted: true,
      providerReference: 'test-payout-payout-test-key',
    });
    expect((await adapter.reconcilePayout({
      providerReference: submitted.providerReference,
      idempotencyKey: 'payout-test-key',
    })).status).toBe('UNKNOWN');
  });

  it('keeps accepted payout submission pending until provider reconciliation confirms success', async () => {
    mocks.tx.artistPayout.findUnique
      .mockResolvedValueOnce({ id: 'payout-1', orderId: 'order-1', status: 'APPROVED', attemptCount: 0 })
      .mockResolvedValueOnce({ id: 'payout-1', orderId: 'order-1' });
    mocks.tx.artistPayout.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 'payout-1', status: 'APPROVED', attemptCount: 0 })
      .mockResolvedValueOnce({
        fulfillmentId: 'fulfillment-1',
        orderId: 'order-1',
        id: 'payout-1',
        artistId: 'artist-1',
        amountMinorUnits: 9000n,
        commissionMinorUnits: 1000n,
        currency: 'USD',
        fulfillment: { orderId: 'order-1', artistId: 'artist-1' },
        order: {
          currency: 'USD',
          releaseStatus: 'ELIGIBLE',
          releaseHoldAt: null,
          buyerReceivedGoodAt: new Date(),
          deliveryDisputes: [],
          payments: [{ id: 'payment-1', status: 'SUCCEEDED', currency: 'USD' }],
          refunds: [],
        },
      })
      .mockResolvedValueOnce({
        id: 'payout-1',
        artistId: 'artist-1',
        amountMinorUnits: 9000n,
        currency: 'USD',
        idempotencyKey: 'payout-operation-1',
        providerReference: null,
        attemptCount: 1,
      })
      .mockResolvedValueOnce({ status: 'SUBMITTED' })
      .mockResolvedValueOnce({ id: 'payout-1', status: 'PENDING' });
    mocks.tx.artistPayout.update.mockResolvedValue({});
    mocks.tx.orderItem.findMany.mockResolvedValue([{
      currency: 'USD',
      subtotal: { toString: () => '100.00' },
      commissionAmount: { toString: () => '10.00' },
    }]);
    mocks.tx.financialOperationEvent.create.mockResolvedValue({});
    mocks.recordAudit.mockResolvedValue(undefined);

    const submitted = await submitPayout(
      'payout-1',
      'staff-1',
      createFakeFinancialProviderAdapter(),
    );

    expect(submitted).toMatchObject({ status: 'PENDING' });
    expect(mocks.tx.financialActivity.create).not.toHaveBeenCalled();
  });

  it('does not resubmit after an ambiguous provider transport failure', async () => {
    mocks.tx.artistPayout.findUnique
      .mockResolvedValueOnce({
        id: 'payout-1',
        orderId: 'order-1',
        status: 'APPROVED',
        attemptCount: 0,
      })
      .mockResolvedValueOnce({
        id: 'payout-1',
        orderId: 'order-1',
        status: 'SUBMITTED',
        attemptCount: 1,
      });
    mocks.tx.artistPayout.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 'payout-1', status: 'APPROVED', attemptCount: 0 })
      .mockResolvedValueOnce({
        fulfillmentId: 'fulfillment-1',
        orderId: 'order-1',
        artistId: 'artist-1',
        amountMinorUnits: 9000n,
        commissionMinorUnits: 1000n,
        currency: 'USD',
        fulfillment: { orderId: 'order-1', artistId: 'artist-1' },
        order: {
          currency: 'USD',
          releaseStatus: 'ELIGIBLE',
          buyerReceivedGoodAt: new Date(),
          releaseHoldAt: null,
          deliveryDisputes: [],
          payments: [{ id: 'payment-1', status: 'SUCCEEDED', currency: 'USD' }],
          refunds: [],
        },
      })
      .mockResolvedValueOnce({
        id: 'payout-1',
        artistId: 'artist-1',
        amountMinorUnits: 9000n,
        currency: 'USD',
        idempotencyKey: 'payout-operation-1',
        providerReference: null,
        attemptCount: 1,
      })
      .mockResolvedValueOnce({ id: 'payout-1', status: 'SUBMITTED', attemptCount: 1 });
    mocks.tx.orderItem.findMany.mockResolvedValue([{
      currency: 'USD',
      subtotal: { toString: () => '100.00' },
      commissionAmount: { toString: () => '10.00' },
    }]);
    mocks.tx.artistPayout.update.mockResolvedValue({});
    mocks.tx.financialOperationEvent.create.mockResolvedValue({});
    mocks.recordAudit.mockResolvedValue(undefined);
    const baseAdapter = createFakeFinancialProviderAdapter();
    const submitPayoutProvider = vi.fn(async () => {
      throw new Error('transport outcome unknown');
    });
    const adapter = { ...baseAdapter, submitPayout: submitPayoutProvider };

    await expect(submitPayout('payout-1', 'staff-1', adapter)).rejects.toThrow(
      'transport outcome unknown',
    );
    await expect(submitPayout('payout-1', 'staff-1', adapter)).rejects.toMatchObject({
      code: 'INVALID_PAYOUT_TRANSITION',
    });
    expect(submitPayoutProvider).toHaveBeenCalledTimes(1);
  });

  it('records a payout movement only after provider reconciliation confirms success', async () => {
    const payout = {
      id: 'payout-1',
      orderId: 'order-1',
      artistId: 'artist-1',
      amountMinorUnits: 9000n,
      currency: 'USD',
      status: 'PENDING',
      provider: 'test-only',
      providerReference: 'test-payout-ref-1',
      idempotencyKey: 'payout-operation-1',
    };
    mocks.payoutFindUnique.mockResolvedValue({
      idempotencyKey: payout.idempotencyKey,
      providerReference: payout.providerReference,
    });
    mocks.tx.artistPayout.findUnique.mockResolvedValue(payout);
    mocks.tx.artistPayout.update.mockResolvedValue({});
    mocks.tx.artistPayout.findUniqueOrThrow.mockResolvedValue({ ...payout, status: 'SUCCEEDED' });
    mocks.tx.financialActivity.findFirst.mockResolvedValue(null);
    mocks.tx.financialActivity.create.mockResolvedValue({});
    mocks.tx.financialOperationEvent.create.mockResolvedValue({});
    mocks.recordAudit.mockResolvedValue(undefined);

    const result = await reconcilePayout(
      'payout-1',
      'staff-1',
      createFakeFinancialProviderAdapter({
        payoutReconciliation: {
          status: 'SUCCEEDED',
          providerReference: payout.providerReference,
          providerEventId: 'test-event-1',
          occurredAt: new Date('2026-10-10T12:00:00Z'),
        },
      }),
    );

    expect(result).toMatchObject({ status: 'SUCCEEDED' });
    expect(mocks.tx.financialActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        movementType: 'ARTIST_PAYOUT_CONFIRMED',
        amountMinorUnits: 9000n,
        currency: 'USD',
        payoutId: 'payout-1',
      }),
    }));
  });

  it('marks a refund successful and records activity only after provider-confirmed reconciliation', async () => {
    const refund = {
      id: 'refund-1',
      paymentId: 'payment-1',
      orderId: 'order-1',
      amountMinorUnits: 10000n,
      currency: 'USD',
      status: 'PENDING',
      provider: 'test-only',
      providerReference: 'test-refund-ref-1',
      idempotencyKey: 'refund-operation-1',
    };
    mocks.refundFindUnique.mockResolvedValue({
      idempotencyKey: refund.idempotencyKey,
      providerReference: refund.providerReference,
    });
    mocks.tx.refundRequest.findUnique.mockResolvedValue(refund);
    mocks.tx.refundRequest.update.mockResolvedValue({});
    mocks.tx.refundRequest.findUniqueOrThrow.mockResolvedValue({
      ...refund,
      status: 'SUCCEEDED',
    });
    mocks.tx.payment.findUniqueOrThrow.mockResolvedValue({
      amount: { toString: () => '100.00' },
    });
    mocks.tx.payment.update.mockResolvedValue({});
    mocks.tx.payment.findMany.mockResolvedValue([{
      amount: { toString: () => '100.00' },
      currency: 'USD',
    }]);
    mocks.tx.refundRequest.aggregate.mockResolvedValue({
      _sum: { amountMinorUnits: 10000n },
    });
    mocks.tx.order.update.mockResolvedValue({});
    mocks.tx.financialActivity.findFirst.mockResolvedValue(null);
    mocks.tx.financialActivity.create.mockResolvedValue({});
    mocks.tx.financialOperationEvent.create.mockResolvedValue({});
    mocks.recordAudit.mockResolvedValue(undefined);

    const result = await reconcileRefund(
      'refund-1',
      'staff-1',
      createFakeFinancialProviderAdapter({
        refundReconciliation: {
          status: 'SUCCEEDED',
          providerReference: refund.providerReference,
          providerEventId: 'test-refund-event-1',
        },
      }),
    );

    expect(result).toMatchObject({ status: 'SUCCEEDED' });
    expect(mocks.tx.financialActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        movementType: 'REFUND_CONFIRMED',
        amountMinorUnits: 10000n,
        currency: 'USD',
        refundId: 'refund-1',
      }),
    }));
  });

  it('keeps an unknown provider outcome in manual reconciliation without a financial activity', async () => {
    const payout = {
      id: 'payout-1',
      orderId: 'order-1',
      artistId: 'artist-1',
      amountMinorUnits: 9000n,
      currency: 'USD',
      status: 'PENDING',
      provider: 'test-only',
      providerReference: 'test-payout-ref-1',
      idempotencyKey: 'payout-operation-1',
    };
    mocks.payoutFindUnique.mockResolvedValue({
      idempotencyKey: payout.idempotencyKey,
      providerReference: payout.providerReference,
    });
    mocks.tx.artistPayout.findUnique.mockResolvedValue(payout);
    mocks.tx.artistPayout.update.mockResolvedValue({});
    mocks.tx.artistPayout.findUniqueOrThrow.mockResolvedValue({
      ...payout,
      status: 'MANUAL_RECONCILIATION',
    });
    mocks.tx.financialActivity.findFirst.mockResolvedValue(null);
    mocks.tx.financialOperationEvent.create.mockResolvedValue({});
    mocks.recordAudit.mockResolvedValue(undefined);

    const result = await reconcilePayout(
      'payout-1',
      'staff-1',
      createFakeFinancialProviderAdapter(),
    );

    expect(result).toMatchObject({ status: 'MANUAL_RECONCILIATION' });
    expect(mocks.tx.artistPayout.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'MANUAL_RECONCILIATION',
        lastErrorCode: 'TEST_STATUS_UNSET',
      }),
    }));
    expect(mocks.tx.financialActivity.create).not.toHaveBeenCalled();
  });

  it('allows retry authorization only from a definitive failed payout state', async () => {
    preparePayoutAuthorization({}, '10.00', 'FAILED');

    const retry = await authorizePayoutRetry({
      payoutId: 'payout-1',
      actorId: 'staff-1',
      reason: 'Retry after definitive provider failure',
    });

    expect(retry).toMatchObject({ status: 'APPROVED' });
    expect(mocks.tx.artistPayout.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'APPROVED', nextRetryAt: null, lastErrorCode: null },
    }));
    expect(mocks.tx.financialOperationEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventType: 'RETRY_AUTHORIZED',
        fromStatus: 'FAILED',
        toStatus: 'APPROVED',
      }),
    }));
  });

  it.each([
    ['payment is no longer captured', { payments: [] }, 'PAYOUT_NOT_ELIGIBLE'],
    ['payment has partial or full refund status', {
      payments: [{ id: 'payment-1', status: 'PARTIALLY_REFUNDED', currency: 'USD' }],
    }, 'PAYOUT_NOT_ELIGIBLE'],
    ['release hold exists', { releaseHoldAt: new Date() }, 'PAYOUT_NOT_ELIGIBLE'],
    ['an open dispute exists', { deliveryDisputes: [{ id: 'dispute-1' }] }, 'PAYOUT_NOT_ELIGIBLE'],
    ['release eligibility was revoked', { releaseStatus: 'BLOCKED' }, 'PAYOUT_NOT_ELIGIBLE'],
    ['a refund remains unresolved', { refunds: [{ id: 'refund-1' }] }, 'REFUND_RECONCILIATION_REQUIRED'],
  ])('blocks payout approval when %s', async (_scenario, overrides, code) => {
    preparePayoutAuthorization(overrides);

    await expect(decidePayout({
      payoutId: 'payout-1',
      actorId: 'approver-1',
      decision: 'APPROVE',
      reason: 'Review payout conditions',
    })).rejects.toMatchObject({ code });

    expect(mocks.tx.artistPayout.updateMany).not.toHaveBeenCalled();
  });

  it('blocks payout approval when stored amount no longer matches commission snapshots', async () => {
    preparePayoutAuthorization({}, '11.00');

    await expect(decidePayout({
      payoutId: 'payout-1',
      actorId: 'approver-1',
      decision: 'APPROVE',
      reason: 'Review payout conditions',
    })).rejects.toMatchObject({ status: 409, code: 'PAYOUT_AMOUNT_MISMATCH' });

    expect(mocks.tx.artistPayout.updateMany).not.toHaveBeenCalled();
  });

  it('revalidates the same eligibility conditions before retry authorization', async () => {
    preparePayoutAuthorization({ deliveryDisputes: [{ id: 'dispute-1' }] }, '10.00', 'FAILED');
    mocks.tx.artistPayout.findUniqueOrThrow.mockReset();
    mocks.tx.artistPayout.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 'payout-1', orderId: 'order-1', status: 'FAILED' })
      .mockResolvedValueOnce({
        fulfillmentId: 'fulfillment-1',
        orderId: 'order-1',
        artistId: 'artist-1',
        amountMinorUnits: 9000n,
        commissionMinorUnits: 1000n,
        currency: 'USD',
        fulfillment: { orderId: 'order-1', artistId: 'artist-1' },
        order: {
          currency: 'USD',
          releaseStatus: 'ELIGIBLE',
          buyerReceivedGoodAt: new Date(),
          releaseHoldAt: null,
          deliveryDisputes: [{ id: 'dispute-1' }],
          payments: [{ id: 'payment-1', status: 'SUCCEEDED', currency: 'USD' }],
          refunds: [],
        },
      });

    await expect(authorizePayoutRetry({
      payoutId: 'payout-1',
      actorId: 'staff-1',
      reason: 'Retry after definitive provider failure',
    })).rejects.toMatchObject({ code: 'PAYOUT_NOT_ELIGIBLE' });
    expect(mocks.tx.artistPayout.update).not.toHaveBeenCalled();
  });
});
