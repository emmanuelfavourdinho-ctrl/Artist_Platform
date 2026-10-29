/**
 * Provider-independent representation for a future verified quote. There is
 * no quote source or non-USD checkout flow wired into the current application.
 */
export interface FxQuote {
  baseAmount: string;
  baseCurrency: 'USD';
  convertedAmount: string;
  convertedCurrency: string;
  exchangeRate: string;
  source: string;
  quotedAt: string;
  expiresAt: string;
  fees: { amount: string; currency: string; description: string }[];
}
