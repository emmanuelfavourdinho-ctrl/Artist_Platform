import type { AuditAction, Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditInput {
  /** null for automatic/system events (e.g. a suspension expiring). */
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  requestId?: string | null;
  /** Before/after state and related ids. Never put secrets, tokens, full
   *  payment details or free-form personal data here. */
  metadata?: Prisma.InputJsonValue;
}

/*
  Explainer: the ONE way admin code writes to the audit trail. It takes
  the caller's transaction client, so the audit row commits or rolls back
  together with the change it describes — it is impossible to have a
  moderation action with no audit record, or an audit record for an
  action that was rolled back. Audit rows are append-only by design: there
  is no update or delete path anywhere in the API.
*/
export function recordAudit(db: Db, input: AuditInput) {
  return db.auditLog.create({
    data: {
      userId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      reason: input.reason ?? null,
      requestId: input.requestId ?? null,
      metadata: input.metadata,
    },
  });
}
