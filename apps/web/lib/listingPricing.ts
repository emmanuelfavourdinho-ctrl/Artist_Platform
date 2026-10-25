const USD_PRICE = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

export const UNVERIFIED_LISTING_PRICE = 'Price pending USD verification';

export function isVerifiedUsdListing(currency: string | null | undefined): boolean {
  return currency?.toUpperCase() === 'USD';
}

export function getListingAvailabilityLabel(
  currency: string | null | undefined,
  available: boolean,
): string | null {
  if (!isVerifiedUsdListing(currency)) return 'Price verification required';
  return available ? null : 'Sold';
}

export function formatListingPrice(amount: string | number, currency: string | null | undefined): string {
  if (!isVerifiedUsdListing(currency) || !USD_PRICE.test(String(amount))) {
    return UNVERIFIED_LISTING_PRICE;
  }
  const [whole, fraction = ''] = String(amount).split('.');
  const cents = fraction.padEnd(2, '0');
  return `$${new Intl.NumberFormat('en-US').format(BigInt(whole!))}.${cents}`;
}

export function sumUsdListingPrices(
  items: { price: string | number; currency: string }[],
): string | null {
  if (items.some((item) => !isVerifiedUsdListing(item.currency) || !USD_PRICE.test(String(item.price)))) {
    return null;
  }
  const cents = items.reduce((sum, item) => {
    const [whole, fraction = ''] = String(item.price).split('.');
    return sum + BigInt(whole!) * BigInt(100) + BigInt(fraction.padEnd(2, '0') || '0');
  }, BigInt(0));
  const whole = cents / BigInt(100);
  const fraction = String(cents % BigInt(100)).padStart(2, '0');
  return `${whole}.${fraction}`;
}
