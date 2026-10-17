import type { EnforcementAction, UserStatus } from '@prisma/client';
import { HttpError } from '../lib/httpError.js';
import { hasPermission, isStaff } from '../lib/permissions.js';
import { prisma } from '../lib/prisma.js';
import { recordAudit } from './auditService.js';

/*
  Explainer — what each account state means (enforced, not decorative):

    ACTIVE / PENDING_VERIFICATION  normal use.
    RESTRICTED   can sign in and browse; blocked from creating activity
                 (requireGoodStanding on checkout, commissions, messages,
                 reviews, posts, artwork).
    SUSPENDED    blocked from every authenticated endpoint (requireAuth).
                 May be temporary.
    BANNED       same as SUSPENDED but permanent; only a user holding
                 `users.ban` can reinstate it.
    DEACTIVATED  the user's own choice. Admin enforcement never touches it.

  All transition rules live in this file so there is exactly one place to
  read or change them.
*/

export type EnforcementRequest = 'WARNING' | 'RESTRICT' | 'SUSPEND' | 'BAN' | 'REINSTATE';

const ACTION_TO_RECORD: Record<EnforcementRequest, EnforcementAction> = {
  WARNING: 'WARNING',
  RESTRICT: 'RESTRICTION',
  SUSPEND: 'SUSPENSION',
  BAN: 'BAN',
  REINSTATE: 'REINSTATEMENT',
};

// action -> statuses it may be applied from -> status it produces.
// (WARNING produces no status change.)
const TRANSITIONS: Record<
  Exclude<EnforcementRequest, 'WARNING'>,
  { from: UserStatus[]; to: UserStatus }
> = {
  RESTRICT: { from: ['ACTIVE', 'PENDING_VERIFICATION'], to: 'RESTRICTED' },
  SUSPEND: { from: ['ACTIVE', 'PENDING_VERIFICATION', 'RESTRICTED'], to: 'SUSPENDED' },
  BAN: { from: ['ACTIVE', 'PENDING_VERIFICATION', 'RESTRICTED', 'SUSPENDED'], to: 'BANNED' },
  REINSTATE: { from: ['RESTRICTED', 'SUSPENDED', 'BANNED'], to: 'ACTIVE' },
};

const WARNABLE: UserStatus[] = ['ACTIVE', 'PENDING_VERIFICATION', 'RESTRICTED'];
const ACTIVE_MEASURES: EnforcementAction[] = ['RESTRICTION', 'SUSPENSION', 'BAN'];

export interface ApplyEnforcementInput {
  targetId: string;
  actor: { id: string; roles: string[] };
  action: EnforcementRequest;
  reason: string;
  expiresAt?: Date | null;
  reportId?: string | null;
  requestId?: string | null;
}

export async function applyEnforcement(input: ApplyEnforcementInput) {
  const { targetId, actor, action, reason, requestId } = input;

  if (targetId === actor.id) {
    throw new HttpError(400, 'You cannot take enforcement action against your own account', {
      code: 'SELF_ENFORCEMENT',
    });
  }
  if ((action === 'BAN') && !hasPermission(actor.roles, 'users.ban')) {
    throw new HttpError(403, 'Banning requires additional permission', {
      code: 'PERMISSION_DENIED',
    });
  }
  if (input.expiresAt && action !== 'RESTRICT' && action !== 'SUSPEND') {
    throw new HttpError(400, 'Only restrictions and suspensions can have an end date', {
      code: 'INVALID_EXPIRY',
    });
  }

  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: targetId },
      select: { id: true, status: true, roles: { select: { role: { select: { name: true } } } } },
    });
    if (!target) throw new HttpError(404, 'User not found', { code: 'USER_NOT_FOUND' });

    const targetRoles = target.roles.map((r) => r.role.name);
    // Staff accounts are never enforced through this API: an admin cannot
    // lock out the people who can reverse a mistake, and a moderator cannot
    // act against colleagues. Role changes (and, for ADMIN, any manual
    // intervention) go through the audited role endpoint / operations.
    if (targetRoles.includes('ADMIN') || (isStaff(targetRoles) && !hasPermission(actor.roles, 'roles.manage'))) {
      throw new HttpError(403, 'This account is protected from enforcement actions', {
        code: 'PROTECTED_ACCOUNT',
      });
    }
    if (target.status === 'DEACTIVATED') {
      throw new HttpError(409, 'Deactivated accounts are managed by the account owner', {
        code: 'ACCOUNT_DEACTIVATED',
      });
    }
    if (action === 'REINSTATE' && target.status === 'BANNED' && !hasPermission(actor.roles, 'users.ban')) {
      throw new HttpError(403, 'Reinstating a banned account requires additional permission', {
        code: 'PERMISSION_DENIED',
      });
    }

    const previousStatus = target.status;
    const now = new Date();
    const recordAction = ACTION_TO_RECORD[action];

    let newStatus: UserStatus | null = null;
    if (action === 'WARNING') {
      if (!WARNABLE.includes(previousStatus)) {
        throw new HttpError(409, `Cannot warn an account that is ${previousStatus}`, {
          code: 'INVALID_STATUS_TRANSITION',
        });
      }
    } else {
      const rule = TRANSITIONS[action];
      if (!rule.from.includes(previousStatus)) {
        throw new HttpError(409, `Cannot ${action.toLowerCase()} an account that is ${previousStatus}`, {
          code: 'INVALID_STATUS_TRANSITION',
        });
      }
      newStatus = rule.to;

      // Compare-and-set on the status we just read: if another admin
      // changed it in the meantime this matches zero rows and we refuse,
      // instead of silently overwriting their decision.
      const updated = await tx.user.updateMany({
        where: { id: targetId, status: previousStatus },
        data: { status: newStatus },
      });
      if (updated.count !== 1) {
        throw new HttpError(409, 'This account was changed by someone else. Reload and try again.', {
          code: 'CONCURRENT_STATUS_CHANGE',
        });
      }

      // The previous measure (if any) is over: replaced or lifted.
      await tx.userEnforcement.updateMany({
        where: { userId: targetId, endedAt: null, action: { in: ACTIVE_MEASURES } },
        data: { endedAt: now, endedReason: action === 'REINSTATE' ? 'REINSTATED' : 'SUPERSEDED' },
      });
    }

    const enforcement = await tx.userEnforcement.create({
      data: {
        userId: targetId,
        actorId: actor.id,
        action: recordAction,
        reason,
        previousStatus,
        newStatus,
        expiresAt: input.expiresAt ?? null,
        reportId: input.reportId ?? null,
      },
    });

    if (action === 'WARNING') {
      // The user is told about a warning; every other action is visible to
      // them as a changed account state.
      await tx.notification.create({
        data: {
          userId: targetId,
          type: 'ACCOUNT_WARNING',
          title: 'Warning from the Fine Arts team',
          message: reason,
        },
      });
    }

    await recordAudit(tx, {
      actorId: actor.id,
      action: action === 'WARNING' ? 'USER_WARNED' : 'USER_STATUS_CHANGED',
      entityType: 'User',
      entityId: targetId,
      reason,
      requestId,
      metadata: {
        enforcement: recordAction,
        enforcementId: enforcement.id,
        from: previousStatus,
        to: newStatus ?? previousStatus,
        expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
        reportId: input.reportId ?? null,
      },
    });

    return { userId: targetId, status: newStatus ?? previousStatus, enforcement };
  });
}

/*
  Explainer: temporary measures end on their own, but not via a scheduled
  job that could fail silently. requireAuth calls this for any RESTRICTED
  or SUSPENDED user, so the moment an expired measure's owner makes a
  request it is lifted (and audited with a null actor = "system").
  Returns true if the user was reinstated.
*/
export async function reinstateIfExpired(userId: string, now: Date = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const expired = await tx.userEnforcement.findFirst({
      where: {
        userId,
        endedAt: null,
        action: { in: ['RESTRICTION', 'SUSPENSION'] },
        expiresAt: { lte: now },
      },
      select: { id: true, action: true },
    });
    if (!expired) return false;

    const updated = await tx.user.updateMany({
      where: { id: userId, status: { in: ['RESTRICTED', 'SUSPENDED'] } },
      data: { status: 'ACTIVE' },
    });
    if (updated.count !== 1) return false;

    const reason = 'Temporary measure expired';
    await tx.userEnforcement.updateMany({
      where: { userId, endedAt: null, action: { in: ACTIVE_MEASURES } },
      data: { endedAt: now, endedReason: 'EXPIRED' },
    });
    const record = await tx.userEnforcement.create({
      data: {
        userId,
        actorId: null,
        action: 'REINSTATEMENT',
        reason,
        previousStatus: expired.action === 'RESTRICTION' ? 'RESTRICTED' : 'SUSPENDED',
        newStatus: 'ACTIVE',
      },
    });
    await recordAudit(tx, {
      actorId: null,
      action: 'USER_STATUS_CHANGED',
      entityType: 'User',
      entityId: userId,
      reason,
      metadata: { enforcement: 'REINSTATEMENT', enforcementId: record.id, automatic: true, to: 'ACTIVE' },
    });
    return true;
  });
}
