import type { StatusTone } from '../components/ui/StatusBadge';

// Mirrors apps/api/prisma/schema.prisma `enum CommissionStatus` exactly.
// If that enum changes, this map needs a matching update — there is
// intentionally no runtime fallback for a status that "makes sense but
// isn't listed" because the backend is the source of truth for valid
// commission states, not the frontend.
export type CommissionStatus =
  'SUBMITTED' | 'REVIEWING' | 'ACCEPTED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

const COMMISSION_STATUS_META: Record<CommissionStatus, { label: string; tone: StatusTone }> = {
  SUBMITTED: { label: 'Pending Artist Review', tone: 'warning' },
  REVIEWING: { label: 'Artist Reviewing', tone: 'info' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  REJECTED: { label: 'Declined', tone: 'error' },
  IN_PROGRESS: { label: 'In Progress', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export function getCommissionStatusMeta(status: string): { label: string; tone: StatusTone } {
  return COMMISSION_STATUS_META[status as CommissionStatus] ?? { label: status, tone: 'neutral' };
}
