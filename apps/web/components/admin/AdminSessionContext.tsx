'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchAdminSession, type AdminSession } from '../../lib/adminApi';
import { ErrorBox } from './AdminUi';

interface AdminSessionValue {
  session: AdminSession;
  can: (permission: string) => boolean;
}

const Ctx = createContext<AdminSessionValue | null>(null);

// Loads what the signed-in staff member is allowed to do, from the server.
// The console uses it to hide what they cannot use; the API still checks
// the same permission on every request, so this is convenience, not security.
export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminSession()
      .then(setSession)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load your admin permissions.'),
      );
  }, []);

  if (error) {
    return (
      <div className="p-8">
        <ErrorBox message={error} />
      </div>
    );
  }
  if (!session) {
    return <div className="p-8 text-sm text-muted">Loading…</div>;
  }

  const granted = new Set(session.permissions);
  return <Ctx.Provider value={{ session, can: (p) => granted.has(p) }}>{children}</Ctx.Provider>;
}

export function useAdminSession(): AdminSessionValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useAdminSession must be used inside the admin layout');
  return value;
}
