import { describe, expect, it } from 'vitest';
import {
  formatListingPrice,
  getListingAvailabilityLabel,
  isVerifiedUsdListing,
  sumUsdListingPrices,
  UNVERIFIED_LISTING_PRICE,
} from './listingPricing';

describe('canonical listing price display', () => {
  it('formats USD cents exactly and consistently', () => {
    expect(formatListingPrice('1000.05', 'USD')).toBe('$1,000.05');
    expect(formatListingPrice('0.1', 'usd')).toBe('$0.10');
  });

  it('never presents an unreconciled non-USD price as dollars', () => {
    expect(isVerifiedUsdListing('XAF')).toBe(false);
    expect(formatListingPrice('5000', 'XAF')).toBe(UNVERIFIED_LISTING_PRICE);
    expect(formatListingPrice('100', undefined)).toBe(UNVERIFIED_LISTING_PRICE);
  });

  it('distinguishes unverified prices from sold USD listings', () => {
    expect(getListingAvailabilityLabel('XAF', false)).toBe('Price verification required');
    expect(getListingAvailabilityLabel('USD', false)).toBe('Sold');
    expect(getListingAvailabilityLabel('USD', true)).toBeNull();
  });

  it('sums only verified USD items using integer cents', () => {
    expect(sumUsdListingPrices([
      { price: '0.10', currency: 'USD' },
      { price: '0.20', currency: 'USD' },
    ])).toBe('0.30');
    expect(sumUsdListingPrices([
      { price: '100', currency: 'USD' },
      { price: '5000', currency: 'XAF' },
    ])).toBeNull();
  });
});
