'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { firebaseAuth } from '../lib/firebaseClient';
import { syncWithBackend, logout as firebaseLogout } from '../lib/authClient';
import type {
  AuthResponseUser,
  AuthResponseArtistProfile,
  AuthSuccessBody,
} from '../lib/authRouting';

interface SyncExtra {
  intent?: 'ARTIST' | 'BUYER';
  firstName?: string;
  lastName?: string;
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  appUser: AuthResponseUser | null;
  artistProfile: AuthResponseArtistProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Call this ONCE, right after a signup/login/Google action succeeds,
   * to sync the freshly-authenticated user and get back the data
   * needed to redirect. This is now the ONLY place that ever calls
   * syncWithBackend for an interactive sign-in — see the de-dupe guard
   * below for why that matters. */
  syncAfterAuth: (extra?: SyncExtra) => Promise<AuthSuccessBody>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AuthResponseUser | null>(null);
  const [artistProfile, setArtistProfile] = useState<AuthResponseArtistProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tracks the Firebase UID we most recently, successfully synced.
  // This is the de-dupe guard: onAuthStateChanged fires for EVERY
  // sign-in, including ones we just synced explicitly a moment ago via
  // syncAfterAuth. Without this, every signup/login made two nearly
  // simultaneous requests to the backend that could race each other.
  const lastSyncedUidRef = useRef<string | null>(null);

  async function loadAppUser(fbUser: FirebaseUser, extra?: SyncExtra): Promise<AuthSuccessBody> {
    try {
      const body = await syncWithBackend(
        { user: fbUser } as Parameters<typeof syncWithBackend>[0],
        extra,
      );
      lastSyncedUidRef.current = fbUser.uid;
      setAppUser(body.user);
      setArtistProfile(body.artistProfile);
      setError(null);
      return body;
    } catch (err) {
      setError('account_sync_failed');
      setAppUser(null);
      setArtistProfile(null);
      throw err;
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        if (lastSyncedUidRef.current !== fbUser.uid) {
          try {
            await loadAppUser(fbUser);
          } catch {
            // loadAppUser already recorded the error in state above.
          }
        }
      } else {
        lastSyncedUidRef.current = null;
        setAppUser(null);
        setArtistProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function refresh() {
    if (firebaseUser) {
      await loadAppUser(firebaseUser);
    }
  }

  async function syncAfterAuth(extra?: SyncExtra): Promise<AuthSuccessBody> {
    const fbUser = firebaseAuth.currentUser;
    if (!fbUser) throw new Error('not_authenticated');
    return loadAppUser(fbUser, extra);
  }

  async function signOut() {
    await firebaseLogout();
    lastSyncedUidRef.current = null;
    setAppUser(null);
    setArtistProfile(null);
  }

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        appUser,
        artistProfile,
        loading,
        error,
        refresh,
        signOut,
        syncAfterAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
