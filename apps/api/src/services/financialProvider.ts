export type ProviderReconciliationStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

export interface ProviderSubmissionResult {
  accepted: boolean;
  providerReference: string | null;
  errorCode?: string;
}

export interface ProviderReconciliationResult {
  status: ProviderReconciliationStatus;
  providerReference?: string;
  providerEventId?: string;
  occurredAt?: Date;
  errorCode?: string;
}

export interface RefundProviderInput {
  idempotencyKey: string;
  providerPaymentReference: string;
  amountMinorUnits: string;
  currency: string;
  reason: string;
}

export interface PayoutProviderInput {
  idempotencyKey: string;
  internalArtistReference: string;
  amountMinorUnits: string;
  currency: string;
}

export interface FinancialProviderAdapter {
  readonly providerName: string;
  readonly configured: boolean;
  submitRefund(input: RefundProviderInput): Promise<ProviderSubmissionResult>;
  reconcileRefund(input: { providerReference: string | null; idempotencyKey: string }): Promise<ProviderReconciliationResult>;
  submitPayout(input: PayoutProviderInput): Promise<ProviderSubmissionResult>;
  reconcilePayout(input: { providerReference: string | null; idempotencyKey: string }): Promise<ProviderReconciliationResult>;
}

export class FinancialProviderError extends Error {
  constructor(
    message: string,
    public readonly outcome: 'FAILED' | 'UNKNOWN',
    public readonly code: string,
  ) {
    super(message);
    this.name = 'FinancialProviderError';
  }
}

class UnconfiguredFinancialProviderAdapter implements FinancialProviderAdapter {
  readonly providerName = 'unconfigured';
  readonly configured = false;

  async submitRefund(): Promise<ProviderSubmissionResult> {
    throw new FinancialProviderError('No financial provider is configured.', 'UNKNOWN', 'PROVIDER_UNCONFIGURED');
  }

  async reconcileRefund(): Promise<ProviderReconciliationResult> {
    return { status: 'UNKNOWN', errorCode: 'PROVIDER_UNCONFIGURED' };
  }

  async submitPayout(): Promise<ProviderSubmissionResult> {
    throw new FinancialProviderError('No financial provider is configured.', 'UNKNOWN', 'PROVIDER_UNCONFIGURED');
  }

  async reconcilePayout(): Promise<ProviderReconciliationResult> {
    return { status: 'UNKNOWN', errorCode: 'PROVIDER_UNCONFIGURED' };
  }
}

export const financialProviderAdapter: FinancialProviderAdapter =
  new UnconfiguredFinancialProviderAdapter();
