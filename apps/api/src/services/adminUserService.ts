import type { Prisma } from '@prisma/client';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import type { AuditLogQuery, ListUsersQuery } from '../validation/adminUsers.js';

/*
  Explainer: what an admin sees about a user. Deliberately a SELECT, never
  a bare `include`: phone, addresses, Firebase uid, password hash etc. are
  not needed to moderate an account and are not returned.
*/
export async function listUsers(query: ListUsersQuery) {
  const { page, pageSize, search, status, role, sort, dir } = query;

  const where: Prisma.UserWhereInput = {
    ...(status ? { status } : {}),
    ...(role ? { roles: { some: { role: { name: role } } } } : {}),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { artistProfile: { is: { displayName: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      // `id` as a tiebreaker keeps pagination stable when sort values collide.
      orderBy: [{ [sort]: dir }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
        artistProfile: { select: { id: true, displayName: true, verificationStatus: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: rows.map((u) => ({ ...u, roles: u.roles.map((r) => r.role.name) })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

export async function getUserDetail(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      avatarUrl: true,
      bio: true,
      location: true,
      emailVerifiedAt: true,
      createdAt: true,
      roles: { select: { role: { select: { name: true } } } },
      artistProfile: {
        select: {
          id: true,
          displayName: true,
          slug: true,
          verificationStatus: true,
          verifiedAt: true,
          _count: { select: { artworks: true } },
        },
      },
      _count: { select: { orders: true, commissionsRequested: true, reviews: true } },
    },
  });
  if (!user) throw new HttpError(404, 'User not found', { code: 'USER_NOT_FOUND' });

  const [enforcements, reportsAgainst, recentAudit] = await Promise.all([
    prisma.userEnforcement.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        action: true,
        reason: true,
        previousStatus: true,
        newStatus: true,
        expiresAt: true,
        endedAt: true,
        endedReason: true,
        createdAt: true,
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    // Reporter identity is intentionally NOT selected (reporter privacy).
    prisma.report.findMany({
      where: { targetType: 'USER', targetId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, reason: true, status: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { entityType: 'User', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        action: true,
        reason: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  return {
    ...user,
    roles: user.roles.map((r) => r.role.name),
    activeMeasure: enforcements.find(
      (e) => !e.endedAt && ['RESTRICTION', 'SUSPENSION', 'BAN'].includes(e.action),
    ) ?? null,
    enforcements,
    reportsAgainst,
    recentAudit,
  };
}

export async function listAuditLogs(query: AuditLogQuery) {
  const { page, pageSize, action, entityType, entityId, actorId, from, to } = query;

  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(actorId ? { userId: actorId } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        reason: true,
        requestId: true,
        metadata: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries: rows, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}
