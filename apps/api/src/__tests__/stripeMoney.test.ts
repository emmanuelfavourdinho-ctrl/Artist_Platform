import { describe, expect, it } from 'vitest';
import { toStripeMinorUnits } from '../lib/stripeMoney.js';

describe('toStripeMinorUnits', () => {
  it('converts two-decimal currencies to cents', () => {
    expect(toStripeMinorUnits(12.34, 'USD')).toBe(1234);
  });

  it('keeps zero-decimal currencies in whole units', () => {
    expect(toStripeMinorUnits(500, 'XAF')).toBe(500);
    // Prisma Decimal(12,2) serializes integer XAF values with trailing zeroes.
    expect(toStripeMinorUnits('500.00', 'XAF')).toBe(500);
  });

  it('rejects fractional amounts for zero-decimal currencies', () => {
    expect(() => toStripeMinorUnits(12.5, 'JPY')).toThrow(
      'This currency does not support fractional amounts.',
    );
  });

  it('rejects unsupported currencies instead of assuming a two-decimal exponent', () => {
    expect(() => toStripeMinorUnits('10.00', 'XYZ')).toThrow('This currency is not supported');
  });

  it('converts exact decimal strings without floating-point scaling', () => {
    expect(toStripeMinorUnits('0.29', 'USD')).toBe(29);
    expect(toStripeMinorUnits('10.230', 'USD')).toBe(1023);
  });

  it('rejects values outside the provider safe-integer range', () => {
    expect(() => toStripeMinorUnits('99999999999999.99', 'USD')).toThrow(
      'This amount cannot be charged safely.',
    );
  });
});
