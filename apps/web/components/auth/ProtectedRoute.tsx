'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  /** If provided, only these roles may view this page. Omit to just require any login. */
  allowRoles?: string[];
}

function ProtectedRouteInner({ children, allowRoles }: ProtectedRouteProps) {
  const { firebaseUser, appUser, loading, error, refresh, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // NEVER redirect while loading — this is the exact bug your spec
    // warned about (§25): redirecting on a still-loading, temporarily
    // undefined user causes a flash-redirect-to-login even for people
    // who ARE logged in.
    if (loading) return;

    if (firebaseUser && (error || !appUser)) return;
    if (!firebaseUser) {
      // Preserve exactly what the person was trying to reach — e.g.
      // /commissions/request?artistId=... — so login/register can send
      // them straight back instead of dropping them on a generic home.
      const query = searchParams.toString();
      const intended = query ? `${pathname}?${query}` : pathname;
      const action = pathname.startsWith('/messages')
        ? 'message'
        : pathname.startsWith('/commissions/request') ? 'commission' : null;
      const actionQuery = action ? `&action=${action}` : '';
      router.replace(`/login?redirect=${encodeURIComponent(intended)}${actionQuery}` as any);
      return;
    }
  }, [loading, firebaseUser, appUser, error, router, pathname, searchParams]);

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Loading…
      </div>
    );
  if (error || (firebaseUser && !appUser))
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl text-foreground">We couldn&apos;t verify your account</h1>
        <p className="mt-3 text-sm text-muted">Your sign-in is still active, but your account details could not be loaded. Check your connection and try again.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-md bg-accent px-5 text-sm font-medium text-background">Try again</button>
          <button type="button" onClick={() => void signOut()} className="min-h-11 px-4 text-sm text-accent underline underline-offset-2">Sign out</button>
        </div>
      </main>
    );
  if (!firebaseUser) return null;
  if (!appUser) return null;
  if (allowRoles && !appUser.roles.some((r) => allowRoles.includes(r)))
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl text-foreground">This area isn&apos;t available for this account</h1>
        <p className="mt-3 text-sm text-muted">Your account is signed in, but it does not have permission to view this page.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link href="/account" className="min-h-11 rounded-md bg-accent px-5 py-3 text-sm font-medium text-background">Go to account</Link>
          <Link href="/gallery" className="min-h-11 px-4 py-3 text-sm text-accent underline underline-offset-2">Browse gallery</Link>
        </div>
      </main>
    );

  return <>{children}</>;
}

// useSearchParams() (used above to preserve the intended destination
// through login) must sit inside a Suspense boundary or Next.js fails
// static prerendering of every page that uses this component. Putting the
// boundary here, once, protects all current and future callers instead of
// requiring each page to remember it.
export function ProtectedRoute(props: ProtectedRouteProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted">
          Loading…
        </div>
      }
    >
      <ProtectedRouteInner {...props} />
    </Suspense>
  );
}
