import type { StatusTone } from '../components/ui/StatusBadge';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  PENDING: { label: 'Pending', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', tone: 'info' },
  PROCESSING: { label: 'Processing', tone: 'info' },
  SHIPPED: { label: 'Shipped', tone: 'info' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  PARTIALLY_REFUNDED: { label: 'Partially refunded', tone: 'warning' },
};

export function getOrderStatusMeta(status: string): { label: string; tone: StatusTone } {
  return ORDER_STATUS_META[status as OrderStatus] ?? { label: status, tone: 'neutral' };
}
