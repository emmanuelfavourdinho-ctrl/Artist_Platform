import { describe, expect, it } from 'vitest';
import { toStripeMinorUnits } from '../lib/stripeMoney.js';

describe('toStripeMinorUnits', () => {
  it('converts two-decimal currencies to cents', () => {
    expect(toStripeMinorUnits(12.34, 'USD')).toBe(1234);
  });

  it('keeps zero-decimal currencies in whole units', () => {
    expect(toStripeMinorUnits(500, 'XAF')).toBe(500);
  });

  it('rejects fractional amounts for zero-decimal currencies', () => {
    expect(() => toStripeMinorUnits(12.5, 'JPY')).toThrow(
      'This currency does not support fractional amounts.',
    );
  });
});
