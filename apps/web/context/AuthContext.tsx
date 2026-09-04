'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { firebaseAuth } from '../lib/firebaseClient';
import { syncWithBackend, logout as firebaseLogout } from '../lib/authClient';
import type { AuthResponseUser, AuthResponseArtistProfile } from '../lib/authRouting';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  appUser: AuthResponseUser | null;
  artistProfile: AuthResponseArtistProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AuthResponseUser | null>(null);
  const [artistProfile, setArtistProfile] = useState<AuthResponseArtistProfile | null>(null);
  // Starts true — we don't know yet whether someone's logged in.
  // Every redirect decision elsewhere MUST wait for this to become false.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAppUser(fbUser: FirebaseUser) {
    try {
      // A throwaway credential-shaped object works here because
      // syncWithBackend only needs .user.getIdToken().
      const body = await syncWithBackend({ user: fbUser } as any);
      setAppUser(body.user);
      setArtistProfile(body.artistProfile);
      setError(null);
    } catch {
      setError('account_sync_failed');
      setAppUser(null);
      setArtistProfile(null);
    }
  }

  useEffect(() => {
    // This fires once on load AND every time login/logout happens —
    // it's the single source of truth for "is anyone logged in."
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await loadAppUser(fbUser);
      } else {
        setAppUser(null);
        setArtistProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function refresh() {
    if (firebaseUser) await loadAppUser(firebaseUser);
  }

  async function signOut() {
    await firebaseLogout();
    setAppUser(null);
    setArtistProfile(null);
  }

  return (
    <AuthContext.Provider
      value={{ firebaseUser, appUser, artistProfile, loading, error, refresh, signOut }}
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
