import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import type { StaffRole } from '../lib/permissions.js';
import { recordAudit } from './auditService.js';

export interface ChangeStaffRoleInput {
  targetId: string;
  actorId: string;
  role: StaffRole;
  operation: 'GRANT' | 'REVOKE';
  reason: string;
  requestId?: string | null;
}

/*
  Explainer: privilege changes, with the escalation guards in one place.
    - Only callers holding `roles.manage` reach this (route-level).
    - You can never change your OWN roles, so nobody can promote
      themselves or quietly remove their own audit trail's accountability.
    - The LAST administrator cannot lose ADMIN: the platform must always
      have someone who can undo a mistake.
    - Only staff roles are managed here; BUYER/ARTIST belong to the
      signup and artist-upgrade flows.
  Everything runs in one transaction with its audit record.
*/
export async function changeStaffRole(input: ChangeStaffRoleInput) {
  const { targetId, actorId, role, operation, reason, requestId } = input;

  if (targetId === actorId) {
    throw new HttpError(400, 'You cannot change your own roles', { code: 'SELF_ROLE_CHANGE' });
  }

  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: targetId },
      select: { id: true, status: true, roles: { select: { role: { select: { name: true } } } } },
    });
    if (!target) throw new HttpError(404, 'User not found', { code: 'USER_NOT_FOUND' });

    const before = target.roles.map((r) => r.role.name);
    const has = before.includes(role);

    if (operation === 'GRANT') {
      if (has) throw new HttpError(409, `User already has the ${role} role`, { code: 'ROLE_ALREADY_GRANTED' });
      if (target.status !== 'ACTIVE') {
        throw new HttpError(409, 'Staff roles can only be granted to active accounts', {
          code: 'ACCOUNT_NOT_ACTIVE',
        });
      }
    } else {
      if (!has) throw new HttpError(409, `User does not have the ${role} role`, { code: 'ROLE_NOT_GRANTED' });
      if (role === 'ADMIN') {
        const admins = await tx.userRole.count({ where: { role: { name: 'ADMIN' } } });
        if (admins <= 1) {
          throw new HttpError(409, 'The last administrator cannot be removed', { code: 'LAST_ADMIN' });
        }
      }
    }

    const roleRow = await tx.role.findUnique({ where: { name: role }, select: { id: true } });
    if (!roleRow) {
      throw new HttpError(409, `The ${role} role is not configured in this environment`, {
        code: 'ROLE_NOT_CONFIGURED',
      });
    }

    if (operation === 'GRANT') {
      await tx.userRole.create({ data: { userId: targetId, roleId: roleRow.id } });
    } else {
      await tx.userRole.delete({ where: { userId_roleId: { userId: targetId, roleId: roleRow.id } } });
    }

    const after = operation === 'GRANT' ? [...before, role] : before.filter((r) => r !== role);
    await recordAudit(tx, {
      actorId,
      action: 'USER_ROLE_UPDATED',
      entityType: 'User',
      entityId: targetId,
      reason,
      requestId,
      metadata: { operation, role, before, after },
    });

    return { userId: targetId, roles: after };
  });
}
