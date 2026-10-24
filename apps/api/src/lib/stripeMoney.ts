import { HttpError } from './httpError.js';

// Stripe's API accepts amount values in each currency's minor unit. Most
// currencies use two decimal places; these supported zero-decimal currencies
// must be sent as whole units.
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

export function toStripeMinorUnits(amount: number, currency: string): number {
  const code = currency.toLowerCase();
  const factor = ZERO_DECIMAL_CURRENCIES.has(code) ? 1 : 100;
  const scaled = amount * factor;
  if (!Number.isFinite(scaled) || scaled <= 0 || !Number.isSafeInteger(Math.round(scaled))) {
    throw new HttpError(400, 'This amount cannot be charged in the selected currency.', {
      code: 'INVALID_CURRENCY_AMOUNT',
    });
  }
  if (factor === 1 && !Number.isInteger(amount)) {
    throw new HttpError(400, 'This currency does not support fractional amounts.', {
      code: 'INVALID_CURRENCY_AMOUNT',
    });
  }
  return Math.round(scaled);
}
