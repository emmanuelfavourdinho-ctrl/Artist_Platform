import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/httpError.js';
import { permissionsForRoles } from '../lib/permissions.js';
import { applyEnforcement } from '../services/enforcementService.js';
import { getUserDetail, listAuditLogs, listUsers } from '../services/adminUserService.js';
import { changeStaffRole } from '../services/roleService.js';
import type {
  AuditLogQuery,
  EnforcementBody,
  ListUsersQuery,
  StaffRoleBody,
} from '../validation/adminUsers.js';

function actorOf(req: Request) {
  if (!req.user) throw new HttpError(401, 'Login required', { code: 'AUTH_REQUIRED' });
  return req.user;
}

function userIdParam(req: Request): string {
  const { id } = req.params;
  if (!id) throw new HttpError(400, 'User id is required', { code: 'MISSING_USER_ID' });
  return id;
}

// GET /api/v1/admin/session — what the signed-in staff member may do, so
// the console can hide what they cannot use. The server still enforces
// every permission on every endpoint; this is only for the UI.
export function getAdminSession(req: Request, res: Response) {
  const user = actorOf(req);
  res.json({
    status: 'success',
    data: {
      id: user.id,
      roles: user.roles,
      permissions: [...permissionsForRoles(user.roles)],
    },
  });
}

export async function listUsersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listUsers(req.query as unknown as ListUsersQuery);
    res.json({ status: 'success', data: data.users, pagination: data.pagination });
  } catch (error) {
    next(error);
  }
}

export async function getUserHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ status: 'success', data: await getUserDetail(userIdParam(req)) });
  } catch (error) {
    next(error);
  }
}

export async function enforceUserHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = actorOf(req);
    const body = req.body as EnforcementBody;
    const result = await applyEnforcement({
      targetId: userIdParam(req),
      actor: { id: actor.id, roles: actor.roles },
      action: body.action,
      reason: body.reason,
      expiresAt: body.expiresAt ?? null,
      reportId: body.reportId ?? null,
      requestId: req.id ?? null,
    });
    res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

export async function changeRoleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = actorOf(req);
    const body = req.body as StaffRoleBody;
    const result = await changeStaffRole({
      targetId: userIdParam(req),
      actorId: actor.id,
      role: body.role,
      operation: body.operation,
      reason: body.reason,
      requestId: req.id ?? null,
    });
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

export async function listAuditLogsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listAuditLogs(req.query as unknown as AuditLogQuery);
    res.json({ status: 'success', data: data.entries, pagination: data.pagination });
  } catch (error) {
    next(error);
  }
}
