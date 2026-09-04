'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  /** If provided, only these roles may view this page. Omit to just require any login. */
  allowRoles?: string[];
}

export function ProtectedRoute({ children, allowRoles }: ProtectedRouteProps) {
  const { appUser, loading, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // NEVER redirect while loading — this is the exact bug your spec
    // warned about (§25): redirecting on a still-loading, temporarily
    // undefined user causes a flash-redirect-to-login even for people
    // who ARE logged in.
    if (loading) return;

    if (!appUser) {
      router.replace('/login');
      return;
    }
    if (allowRoles && !appUser.roles.some((r) => allowRoles.includes(r))) {
      // Logged in, but wrong role — send to their own correct home
      // rather than a scary blank error page.
      router.replace(
        appUser.roles.includes('ADMIN')
          ? '/admin'
          : appUser.roles.includes('ARTIST')
            ? '/studio'
            : '/gallery',
      );
    }
  }, [loading, appUser, allowRoles, router]);

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Loading…
      </div>
    );
  if (error)
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-red-600">
        We couldn&apos;t load your account. Please refresh.
      </div>
    );
  if (!appUser) return null;
  if (allowRoles && !appUser.roles.some((r) => allowRoles.includes(r))) return null;

  return <>{children}</>;
}
