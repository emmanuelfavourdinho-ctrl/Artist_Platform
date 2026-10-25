import { HttpError } from './httpError.js';

/**
 * Explicit currencies the current Stripe amount adapter knows how to encode.
 * New artwork listings are USD only; non-USD entries support existing,
 * correctly denominated transactions without implying FX conversion.
 */
export const CURRENCY_MINOR_UNITS: Readonly<Record<string, number>> = Object.freeze({
  usd: 2,
  eur: 2,
  gbp: 2,
  cad: 2,
  aud: 2,
  nzd: 2,
  chf: 2,
  ngn: 2,
  bif: 0,
  clp: 0,
  djf: 0,
  gnf: 0,
  jpy: 0,
  kmf: 0,
  krw: 0,
  mga: 0,
  pyg: 0,
  rwf: 0,
  ugx: 0,
  vnd: 0,
  vuv: 0,
  xaf: 0,
  xof: 0,
  xpf: 0,
});

const LEGACY_ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

const LEGACY_STRIPE_CURRENCIES = new Set(
  [
    'aed', 'afn', 'all', 'amd', 'ang', 'aoa', 'ars', 'aud', 'awg', 'azn',
    'bam', 'bbd', 'bdt', 'bgn', 'bif', 'bmd', 'bnd', 'bob', 'brl', 'bsd',
    'bwp', 'byn', 'bzd', 'cad', 'cdf', 'chf', 'clp', 'cny', 'cop', 'crc',
    'cve', 'czk', 'djf', 'dkk', 'dop', 'dzd', 'egp', 'etb', 'eur', 'fjd',
    'fkp', 'gbp', 'gel', 'gip', 'gmd', 'gnf', 'gtq', 'gyd', 'hkd', 'hnl',
    'htg', 'huf', 'idr', 'ils', 'inr', 'isk', 'jmd', 'jpy', 'kes', 'kgs',
    'khr', 'kmf', 'krw', 'kzt', 'lak', 'lbp', 'lkr', 'lrd', 'lsl', 'mad',
    'mdl', 'mga', 'mkd', 'mmk', 'mnt', 'mop', 'mur', 'mvr', 'mwk', 'mxn',
    'myr', 'mzn', 'nad', 'ngn', 'nio', 'nok', 'npr', 'nzd', 'pab', 'pen',
    'pgk', 'php', 'pkr', 'pln', 'pyg', 'qar', 'ron', 'rsd', 'rwf', 'sar',
    'sbd', 'scr', 'sek', 'sgd', 'shp', 'sle', 'sos', 'srd', 'szl', 'thb',
    'tjs', 'top', 'try', 'ttd', 'twd', 'tzs', 'uah', 'ugx', 'usd', 'uyu',
    'uzs', 'vnd', 'vuv', 'wst', 'xaf', 'xcd', 'xof', 'xpf', 'yer', 'zar',
    'zmw',
  ],
);

export const SUPPORTED_CURRENCY_CODES = Object.keys(CURRENCY_MINOR_UNITS).map((currency) =>
  currency.toUpperCase(),
);

export function isSupportedCurrency(currency: string): boolean {
  return CURRENCY_MINOR_UNITS[currency.toLowerCase()] !== undefined;
}

export type DecimalAmount = string | number | { toString(): string };

export function currencyMinorUnitExponent(currency: string): number {
  const exponent = CURRENCY_MINOR_UNITS[currency.toLowerCase()];
  if (exponent === undefined) {
    throw new HttpError(400, 'This currency is not supported for payment.', {
      code: 'UNSUPPORTED_CURRENCY',
    });
  }
  return exponent;
}

function decimalParts(value: DecimalAmount): { negative: boolean; whole: bigint; fraction: string } {
  const text = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) {
    throw new HttpError(400, 'This amount is invalid.', { code: 'INVALID_CURRENCY_AMOUNT' });
  }
  return {
    negative: match[1] === '-',
    whole: BigInt(match[2]!),
    fraction: match[3] ?? '',
  };
}

export function toMinorUnits(amount: DecimalAmount, currency: string): bigint {
  const exponent = currencyMinorUnitExponent(currency);
  return decimalToMinorUnits(amount, exponent);
}

/**
 * The former checkout adapter treated all Stripe-supported currencies as
 * two-decimal except its explicit zero-decimal set. This is only for signed
 * legacy sessions; new checkout remains USD-only and uses toMinorUnits.
 */
export function toLegacyStripeMinorUnits(amount: DecimalAmount, currency: string): bigint {
  const code = currency.toLowerCase();
  if (!LEGACY_STRIPE_CURRENCIES.has(code)) {
    throw new HttpError(400, 'This legacy checkout currency is not supported.', {
      code: 'UNSUPPORTED_CURRENCY',
    });
  }
  return decimalToMinorUnits(amount, LEGACY_ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2);
}

function decimalToMinorUnits(amount: DecimalAmount, exponent: number): bigint {
  const { negative, whole, fraction } = decimalParts(amount);
  if (negative || (fraction.length > exponent && /[1-9]/.test(fraction.slice(exponent)))) {
    throw new HttpError(
      400,
      exponent === 0
        ? 'This currency does not support fractional amounts.'
        : 'This amount has more precision than the currency supports.',
      { code: 'INVALID_CURRENCY_AMOUNT' },
    );
  }
  const scale = 10n ** BigInt(exponent);
  const fractionalUnits = exponent === 0
    ? 0n
    : BigInt(fraction.slice(0, exponent).padEnd(exponent, '0') || '0');
  const units = whole * scale + fractionalUnits;
  if (units <= 0n || units > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new HttpError(400, 'This amount cannot be charged safely.', {
      code: 'INVALID_CURRENCY_AMOUNT',
    });
  }
  return units;
}

export function minorUnitsToDecimal(units: bigint, currency: string): string {
  const exponent = currencyMinorUnitExponent(currency);
  return minorUnitsToDecimalWithExponent(units, exponent);
}

export function minorUnitsToLegacyStripeDecimal(units: bigint, currency: string): string {
  const code = currency.toLowerCase();
  if (!LEGACY_STRIPE_CURRENCIES.has(code)) {
    throw new HttpError(400, 'This legacy checkout currency is not supported.', {
      code: 'UNSUPPORTED_CURRENCY',
    });
  }
  return minorUnitsToDecimalWithExponent(
    units,
    LEGACY_ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2,
  );
}

function minorUnitsToDecimalWithExponent(units: bigint, exponent: number): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  if (exponent === 0) return `${negative ? '-' : ''}${absolute}`;
  const scale = 10n ** BigInt(exponent);
  const whole = absolute / scale;
  const fraction = String(absolute % scale).padStart(exponent, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) {
    throw new Error('roundHalfUp expects a non-negative numerator and positive denominator');
  }
  return (numerator + denominator / 2n) / denominator;
}

export interface CommissionLine {
  id: string;
  subtotalMinor: bigint;
}

/** Calculate the order-level fee, then allocate every cent/unit deterministically. */
export function allocateCommissionMinorUnits(
  lines: CommissionLine[],
  rateBasisPoints: number,
): { totalMinor: bigint; byLineId: Map<string, bigint> } {
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 10_000) {
    throw new Error('Commission basis points must be an integer from 0 to 10000');
  }
  if (new Set(lines.map((line) => line.id)).size !== lines.length || lines.some((line) => line.subtotalMinor < 0n)) {
    throw new Error('Commission lines must have unique ids and non-negative amounts');
  }

  const denominator = 10_000n;
  const basisPoints = BigInt(rateBasisPoints);
  const totalSubtotal = lines.reduce((sum, line) => sum + line.subtotalMinor, 0n);
  const totalMinor = roundHalfUp(totalSubtotal * basisPoints, denominator);
  const allocations = lines.map((line) => ({
    id: line.id,
    amount: (line.subtotalMinor * basisPoints) / denominator,
    remainder: (line.subtotalMinor * basisPoints) % denominator,
  }));
  let remaining = totalMinor - allocations.reduce((sum, line) => sum + line.amount, 0n);
  allocations.sort((a, b) =>
    a.remainder === b.remainder
      ? a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      : a.remainder > b.remainder ? -1 : 1,
  );
  for (const allocation of allocations) {
    if (remaining === 0n) break;
    allocation.amount += 1n;
    remaining -= 1n;
  }
  return { totalMinor, byLineId: new Map(allocations.map(({ id, amount }) => [id, amount])) };
}

export function basisPointsToRateString(rateBasisPoints: number): string {
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 10_000) {
    throw new Error('Commission basis points must be an integer from 0 to 10000');
  }
  return `${Math.floor(rateBasisPoints / 10_000)}.${String(rateBasisPoints % 10_000).padStart(4, '0')}`;
}

export function parseRateToBasisPoints(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(value);
  if (!match) return null;
  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? '').padEnd(4, '0') || '0');
  const basisPoints = whole * 10_000n + fraction;
  return basisPoints <= 10_000n ? Number(basisPoints) : null;
}

export interface LegacyCommissionRate {
  numerator: bigint;
  denominator: bigint;
  snapshot: string;
}

/** Parse the numeric string emitted by the old server config, including exponent notation. */
function toCanonicalDecimalString(value: string): string | null {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value.trim());
  if (!match) return null;

  const sign = match[1] === '-' ? '-' : '';
  const integerPart = match[2]!;
  const fractionPart = match[3] ?? '';
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 500) return null;

  const digits = `${integerPart}${fractionPart}`;
  const decimalIndex = integerPart.length + exponent;

  if (decimalIndex <= 0) {
    return `${sign}0.${'0'.repeat(-decimalIndex)}${digits}`;
  }
  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${'0'.repeat(decimalIndex - digits.length)}`;
  }
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

export function parseLegacyCommissionRate(value: string): LegacyCommissionRate | null {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) return null;

  const exponent = Number(match[3] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 500) return null;

  const fraction = match[2] ?? '';
  const digits = `${match[1]}${fraction}`;
  let numerator = BigInt(digits);
  const scale = fraction.length - exponent;
  let denominator = 1n;
  if (scale > 0) denominator = 10n ** BigInt(scale);
  else if (scale < 0) numerator *= 10n ** BigInt(-scale);

  if (numerator > denominator) return null;

  const snapshot = toCanonicalDecimalString(value);
  if (!snapshot) return null;

  return {
    numerator,
    denominator,
    snapshot,
  };
}

export function roundDecimalToCurrency(value: DecimalAmount, currency: string): string {
  const exponent = currencyMinorUnitExponent(currency);
  const { negative, whole, fraction } = decimalParts(value);
  const kept = fraction.slice(0, exponent).padEnd(exponent, '0');
  const discarded = fraction.slice(exponent);
  let units = whole * (10n ** BigInt(exponent)) + BigInt(kept || '0');
  if (discarded[0] && discarded[0] >= '5') units += 1n;
  return minorUnitsToDecimal(negative ? -units : units, currency);
}
