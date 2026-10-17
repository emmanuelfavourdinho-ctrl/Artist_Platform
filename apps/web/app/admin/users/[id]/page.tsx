'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { AdminDialog } from '../../../../components/admin/AdminDialog';
import { useAdminSession } from '../../../../components/admin/AdminSessionContext';
import { ErrorBox, PageHeader, StatCard, StatusPill } from '../../../../components/admin/AdminUi';
import {
  changeUserRole,
  enforceUser,
  fetchAdminUser,
  type AccountStatus,
  type AdminUserDetail,
  type EnforcementActionRequest,
} from '../../../../lib/adminApi';

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const STAFF_ROLES = ['ADMIN', 'MODERATOR', 'FINANCE_ADMIN'];

interface ActionOption {
  action: EnforcementActionRequest;
  label: string;
  help: string;
  destructive?: boolean;
  allowsEndDate?: boolean;
}

const ACTIONS: Record<EnforcementActionRequest, ActionOption> = {
  WARNING: { action: 'WARNING', label: 'Send warning', help: 'The user is notified. Their account keeps working.' },
  RESTRICT: {
    action: 'RESTRICT',
    label: 'Restrict',
    help: 'They can sign in and browse but cannot order, commission, message, review or publish.',
    allowsEndDate: true,
  },
  SUSPEND: {
    action: 'SUSPEND',
    label: 'Suspend',
    help: 'They cannot use the platform while suspended.',
    destructive: true,
    allowsEndDate: true,
  },
  BAN: { action: 'BAN', label: 'Ban', help: 'Permanent. Only a user with ban permission can reverse it.', destructive: true },
  REINSTATE: { action: 'REINSTATE', label: 'Reinstate', help: 'Restores the account to active and ends the current measure.' },
};

// What the UI OFFERS. The API independently enforces the same transition
// table and permissions, so a stale page can never do something illegal.
function offeredActions(status: AccountStatus, canBan: boolean): ActionOption[] {
  const list: EnforcementActionRequest[] =
    status === 'ACTIVE' || status === 'PENDING_VERIFICATION'
      ? ['WARNING', 'RESTRICT', 'SUSPEND', 'BAN']
      : status === 'RESTRICTED'
        ? ['WARNING', 'SUSPEND', 'BAN', 'REINSTATE']
        : status === 'SUSPENDED'
          ? ['BAN', 'REINSTATE']
          : status === 'BANNED'
            ? ['REINSTATE']
            : [];
  return list
    .filter((a) => canBan || a !== 'BAN')
    .filter((a) => !(a === 'REINSTATE' && status === 'BANNED' && !canBan))
    .map((a) => ACTIONS[a]);
}

function ActionDialog({
  userId,
  userName,
  option,
  onClose,
  onDone,
}: {
  userId: string;
  userName: string;
  option: ActionOption;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reasonOk = reason.trim().length >= 10;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reasonOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      await enforceUser(userId, {
        action: option.action,
        reason: reason.trim(),
        expiresAt: option.allowsEndDate && endDate ? new Date(endDate).toISOString() : undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      title={`${option.label}: ${userName}`}
      description={option.help}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm text-foreground">
          Reason <span className="text-muted">(required, recorded in the audit log)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={1000}
            required
            aria-describedby="reason-hint"
            className="mt-1 w-full rounded-md border border-border/15 bg-background px-3 py-2 text-sm"
          />
          <span id="reason-hint" className="text-xs text-muted">
            At least 10 characters. {reason.trim().length}/1000
          </span>
        </label>

        {option.allowsEndDate && (
          <label className="block text-sm text-foreground">
            Ends on <span className="text-muted">(optional — leave empty for no end date, max 1 year)</span>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-border/15 bg-background px-3 py-2 text-sm"
            />
          </label>
        )}

        {error && <ErrorBox message={error} />}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-border/15 px-4 py-2 text-sm text-foreground/80 transition hover:border-foreground/30 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!reasonOk || busy}
            className={`rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${
              option.destructive
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-accent text-accent-foreground hover:opacity-90'
            }`}
          >
            {busy ? 'Working…' : `Confirm: ${option.label}`}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

function RoleDialog({
  userId,
  role,
  operation,
  onClose,
  onDone,
}: {
  userId: string;
  role: string;
  operation: 'GRANT' | 'REVOKE';
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = role.replace(/_/g, ' ').toLowerCase();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 10 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await changeUserRole(userId, { role, operation, reason: reason.trim() });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      title={`${operation === 'GRANT' ? 'Grant' : 'Revoke'} ${label} role`}
      description="Role changes alter what this person can do across the admin console and are recorded in the audit log."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm text-foreground">
          Reason <span className="text-muted">(required)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            required
            className="mt-1 w-full rounded-md border border-border/15 bg-background px-3 py-2 text-sm"
          />
        </label>
        {error && <ErrorBox message={error} />}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md border border-border/15 px-4 py-2 text-sm disabled:opacity-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={reason.trim().length < 10 || busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            {busy ? 'Working…' : 'Confirm'}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session, can } = useAdminSession();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState<ActionOption | null>(null);
  const [roleChange, setRoleChange] = useState<{ role: string; operation: 'GRANT' | 'REVOKE' } | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchAdminUser(id)
      .then(setUser)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load this user.'),
      );
  }, [id]);

  useEffect(load, [load]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link href={'/admin/users' as Route} className="text-sm text-muted hover:text-foreground">← Users</Link>
        <ErrorBox message={error} onRetry={load} />
      </div>
    );
  }
  if (!user) return <div className="h-40 animate-pulse rounded-lg bg-surface" role="status" aria-label="Loading user" />;

  const name = `${user.firstName} ${user.lastName}`;
  const isSelf = user.id === session.id;
  const isProtected = user.roles.includes('ADMIN');
  const canEnforce = can('users.enforce') && !isSelf && !isProtected;
  const options = canEnforce ? offeredActions(user.status, can('users.ban')) : [];

  const done = (message: string) => {
    setAction(null);
    setRoleChange(null);
    setNotice(message);
    load();
  };

  return (
    <div className="space-y-10">
      <Link href={'/admin/users' as Route} className="text-sm text-muted hover:text-foreground">← Users</Link>

      <PageHeader
        eyebrow="User"
        title={name}
        description={user.email}
        action={<StatusPill status={user.status} />}
      />

      {notice && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      {user.activeMeasure && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-200">
          <p className="font-medium">Current measure: {user.activeMeasure.action.toLowerCase()}</p>
          <p className="mt-1">{user.activeMeasure.reason}</p>
          <p className="mt-1 text-xs">
            {user.activeMeasure.expiresAt
              ? `Ends automatically on ${dateTime.format(new Date(user.activeMeasure.expiresAt))}`
              : 'No end date'}
          </p>
        </div>
      )}

      <section aria-labelledby="summary" className="grid gap-4 sm:grid-cols-3">
        <h2 id="summary" className="sr-only">Summary</h2>
        <StatCard label="Orders" value={user._count.orders} />
        <StatCard label="Commission requests" value={user._count.commissionsRequested} />
        <StatCard label="Reviews" value={user._count.reviews} />
      </section>

      <section aria-labelledby="profile" className="rounded-lg border border-border/10 bg-surface p-5">
        <h2 id="profile" className="font-display text-xl text-foreground">Profile</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs uppercase tracking-[0.12em] text-muted">Roles</dt><dd className="mt-1">{user.roles.join(', ').replace(/_/g, ' ').toLowerCase() || 'none'}</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-muted">Joined</dt><dd className="mt-1">{dateTime.format(new Date(user.createdAt))}</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-muted">Email verified</dt><dd className="mt-1">{user.emailVerifiedAt ? dateTime.format(new Date(user.emailVerifiedAt)) : 'Not verified'}</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-muted">Location</dt><dd className="mt-1">{user.location ?? 'Not provided'}</dd></div>
          {user.bio && <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-[0.12em] text-muted">Bio</dt><dd className="mt-1 whitespace-pre-wrap">{user.bio}</dd></div>}
          {user.artistProfile && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-[0.12em] text-muted">Artist profile</dt>
              <dd className="mt-1">
                {user.artistProfile.displayName} · verification {user.artistProfile.verificationStatus.toLowerCase()} · {user.artistProfile._count.artworks} artworks
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section aria-labelledby="actions" className="space-y-3">
        <h2 id="actions" className="font-display text-xl text-foreground">Enforcement</h2>
        {isSelf && <p className="text-sm text-muted">You cannot take enforcement action against your own account.</p>}
        {isProtected && !isSelf && <p className="text-sm text-muted">Administrator accounts are protected from enforcement actions.</p>}
        {user.status === 'DEACTIVATED' && <p className="text-sm text-muted">This account was deactivated by its owner and is not managed here.</p>}
        {!can('users.enforce') && <p className="text-sm text-muted">You do not have permission to take enforcement action.</p>}
        {options.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <button
                key={o.action}
                type="button"
                onClick={() => { setNotice(null); setAction(o); }}
                className={`rounded-md border px-4 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  o.destructive
                    ? 'border-red-500/40 text-red-300 hover:bg-red-500/10'
                    : 'border-border/20 text-foreground hover:border-accent'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {can('roles.manage') && !isSelf && (
        <section aria-labelledby="roles" className="space-y-3">
          <h2 id="roles" className="font-display text-xl text-foreground">Staff roles</h2>
          <ul className="divide-y divide-border/10 rounded-lg border border-border/10 bg-surface">
            {STAFF_ROLES.map((role) => {
              const has = user.roles.includes(role);
              return (
                <li key={role} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <span>{role.replace(/_/g, ' ').toLowerCase()}</span>
                  <button
                    type="button"
                    onClick={() => { setNotice(null); setRoleChange({ role, operation: has ? 'REVOKE' : 'GRANT' }); }}
                    className="rounded-md border border-border/20 px-3 py-1.5 text-xs transition hover:border-accent"
                  >
                    {has ? 'Revoke' : 'Grant'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="history" className="space-y-3">
        <h2 id="history" className="font-display text-xl text-foreground">Enforcement history</h2>
        {user.enforcements.length === 0 ? (
          <p className="text-sm text-muted">No enforcement actions have been taken against this account.</p>
        ) : (
          <ol className="space-y-3">
            {user.enforcements.map((e) => (
              <li key={e.id} className="rounded-lg border border-border/10 bg-surface px-5 py-4 text-sm">
                <p className="text-foreground">
                  <span className="font-medium">{e.action.toLowerCase()}</span>
                  {e.previousStatus && e.newStatus && e.previousStatus !== e.newStatus && (
                    <span className="text-muted"> · {e.previousStatus.toLowerCase()} → {e.newStatus.toLowerCase()}</span>
                  )}
                </p>
                <p className="mt-1 text-foreground/80">{e.reason}</p>
                <p className="mt-1 text-xs text-muted">
                  {dateTime.format(new Date(e.createdAt))} · {e.actor ? `${e.actor.firstName} ${e.actor.lastName}` : 'System (automatic)'}
                  {e.endedAt && ` · ended ${dateTime.format(new Date(e.endedAt))} (${(e.endedReason ?? '').toLowerCase()})`}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="reports" className="space-y-3">
        <h2 id="reports" className="font-display text-xl text-foreground">Reports against this user</h2>
        {user.reportsAgainst.length === 0 ? (
          <p className="text-sm text-muted">No reports.</p>
        ) : (
          <ul className="divide-y divide-border/10 rounded-lg border border-border/10 bg-surface text-sm">
            {user.reportsAgainst.map((r) => (
              <li key={r.id} className="flex justify-between gap-4 px-5 py-3">
                <span>{r.reason.replace(/_/g, ' ').toLowerCase()}</span>
                <span className="text-xs text-muted">{r.status.toLowerCase()} · {dateTime.format(new Date(r.createdAt))}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">Reporter identities are not shown.</p>
      </section>

      {can('audit.view') && (
        <p className="text-xs text-muted">
          <Link href={`/admin/audit-logs?entityId=${user.id}` as Route} className="underline underline-offset-4 hover:text-accent">
            View full audit trail for this user
          </Link>
        </p>
      )}

      {action && (
        <ActionDialog
          userId={user.id}
          userName={name}
          option={action}
          onClose={() => setAction(null)}
          onDone={() => done(`${action.label} applied to ${name}.`)}
        />
      )}
      {roleChange && (
        <RoleDialog
          userId={user.id}
          role={roleChange.role}
          operation={roleChange.operation}
          onClose={() => setRoleChange(null)}
          onDone={() => done(`Role ${roleChange.operation === 'GRANT' ? 'granted' : 'revoked'}.`)}
        />
      )}
    </div>
  );
}
