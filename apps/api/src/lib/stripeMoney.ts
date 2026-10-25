import { toMinorUnits, type DecimalAmount } from './money.js';

/** Stripe requires a safe integer in provider minor units. */
export function toStripeMinorUnits(amount: DecimalAmount, currency: string): number {
  return Number(toMinorUnits(amount, currency));
}
