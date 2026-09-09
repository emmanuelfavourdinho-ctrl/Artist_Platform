'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserCredential } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { resolveAuthDestination } from './authRouting';
import { mapFirebaseError } from './authClient';

type FirebaseAction = () => Promise<UserCredential>;
interface SyncExtra {
  intent?: 'ARTIST' | 'BUYER';
  firstName?: string;
  lastName?: string;
}

interface UseAuthFormResult {
  error: string | null;
  emailPending: boolean;
  googlePending: boolean;
  anyPending: boolean;
  runEmail: (action: FirebaseAction, extra?: SyncExtra) => Promise<void>;
  runGoogle: (action: FirebaseAction, extra?: SyncExtra) => Promise<void>;
}

export function useAuthForm(redirectTo?: string | null): UseAuthFormResult {
  const router = useRouter();
  const { syncAfterAuth } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [emailPending, setEmailPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  const run = useCallback(
    async (
      action: FirebaseAction,
      extra: SyncExtra | undefined,
      setPending: (v: boolean) => void,
    ) => {
      setError(null);
      setPending(true);
      try {
        await action();
        // The ONE and only sync call for this sign-in, routed through
        // AuthContext so its de-dupe guard registers it and the
        // background onAuthStateChanged listener skips re-doing it.
        const body = await syncAfterAuth(extra);
        router.push(resolveAuthDestination(body, redirectTo));
        router.refresh();
      } catch (err) {
        setError(mapFirebaseError(err));
      } finally {
        setPending(false);
      }
    },
    [router, syncAfterAuth, redirectTo],
  );

  const runEmail = useCallback(
    (action: FirebaseAction, extra?: SyncExtra) => run(action, extra, setEmailPending),
    [run],
  );
  const runGoogle = useCallback(
    (action: FirebaseAction, extra?: SyncExtra) => run(action, extra, setGooglePending),
    [run],
  );

  return {
    error,
    emailPending,
    googlePending,
    anyPending: emailPending || googlePending,
    runEmail,
    runGoogle,
  };
}
