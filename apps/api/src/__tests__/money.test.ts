import { describe, expect, it } from 'vitest';
import {
  allocateCommissionMinorUnits,
  basisPointsToRateString,
  minorUnitsToDecimal,
  parseLegacyCommissionRate,
  parseRateToBasisPoints,
  roundHalfUp,
  toLegacyStripeMinorUnits,
  toMinorUnits,
} from '../lib/money.js';

describe('exact money calculations', () => {
  it('converts exact USD and zero-decimal values to minor units', () => {
    expect(toMinorUnits('0.29', 'USD')).toBe(29n);
    expect(toMinorUnits('500.00', 'XAF')).toBe(500n);
    expect(minorUnitsToDecimal(500n, 'XAF')).toBe('500');
  });

  it('rounds the aggregate commission half-up at the currency minor unit', () => {
    expect(roundHalfUp(5n * 1_000n, 10_000n)).toBe(1n);
    expect(roundHalfUp(15n * 1_000n, 10_000n)).toBe(2n);
  });

  it('allocates aggregate commission by largest remainder with a stable tie-break', () => {
    const result = allocateCommissionMinorUnits(
      [
        { id: 'b', subtotalMinor: 5n },
        { id: 'a', subtotalMinor: 10n },
      ],
      1_000,
    );
    expect(result.totalMinor).toBe(2n);
    expect(result.byLineId.get('a')).toBe(1n);
    expect(result.byLineId.get('b')).toBe(1n);
    expect([...result.byLineId.values()].reduce((sum, value) => sum + value, 0n)).toBe(2n);
  });

  it('handles very small and maximum supported artwork subtotals', () => {
    const small = allocateCommissionMinorUnits([{ id: 'small', subtotalMinor: 1n }], 1_000);
    expect(small.totalMinor).toBe(0n);
    const maximum = allocateCommissionMinorUnits(
      [{ id: 'max', subtotalMinor: 999_999_999_999n }],
      1_000,
    );
    expect(maximum.totalMinor).toBe(100_000_000_000n);
  });

  it('serializes fixed rate snapshots and parses legacy session rates exactly', () => {
    expect(basisPointsToRateString(1_000)).toBe('0.1000');
    expect(parseRateToBasisPoints('0.15')).toBe(1_500);
    expect(parseRateToBasisPoints('0.10001')).toBeNull();
  });

  it('retains the former Stripe amount exponents for explicitly supported legacy currencies', () => {
    expect(toLegacyStripeMinorUnits('12.34', 'SEK')).toBe(1234n);
    expect(toLegacyStripeMinorUnits('500.00', 'XAF')).toBe(500n);
    expect(() => toLegacyStripeMinorUnits('10.00', 'XYZ')).toThrow(
      'This legacy checkout currency is not supported.',
    );
  });

  it('parses legacy rates beyond basis-point precision and preserves the exact validated string', () => {
    expect(parseLegacyCommissionRate('0.12345')).toMatchObject({
      numerator: 12345n,
      denominator: 100000n,
      snapshot: '0.12345',
    });
    expect(parseLegacyCommissionRate('1.5005e-1')).toMatchObject({
      numerator: 15005n,
      denominator: 100000n,
      snapshot: '0.15005',
    });
    expect(parseLegacyCommissionRate('1.0001')).toBeNull();
    expect(parseLegacyCommissionRate('not-a-rate')).toBeNull();
  });
});
