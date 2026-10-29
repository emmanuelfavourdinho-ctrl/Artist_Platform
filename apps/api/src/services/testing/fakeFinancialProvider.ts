import type {
  FinancialProviderAdapter,
  ProviderReconciliationResult,
  ProviderSubmissionResult,
} from '../financialProvider.js';

export interface FakeFinancialProviderOptions {
  refundSubmission?: ProviderSubmissionResult;
  payoutSubmission?: ProviderSubmissionResult;
  refundReconciliation?: ProviderReconciliationResult;
  payoutReconciliation?: ProviderReconciliationResult;
}

export function createFakeFinancialProviderAdapter(
  options: FakeFinancialProviderOptions = {},
): FinancialProviderAdapter {
  return {
    providerName: 'test-only',
    configured: true,
    async submitRefund(input) {
      return options.refundSubmission ?? {
        accepted: true,
        providerReference: `test-refund-${input.idempotencyKey}`,
      };
    },
    async reconcileRefund() {
      return options.refundReconciliation ?? { status: 'UNKNOWN', errorCode: 'TEST_STATUS_UNSET' };
    },
    async submitPayout(input) {
      return options.payoutSubmission ?? {
        accepted: true,
        providerReference: `test-payout-${input.idempotencyKey}`,
      };
    },
    async reconcilePayout() {
      return options.payoutReconciliation ?? { status: 'UNKNOWN', errorCode: 'TEST_STATUS_UNSET' };
    },
  };
}
