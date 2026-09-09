'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { resolveAuthDestination } from '../../lib/authRouting';

interface ProtectedRouteProps {
  children: ReactNode;
  /** If provided, only these roles may view this page. Omit to just require any login. */
  allowRoles?: string[];
}

export function ProtectedRoute({ children, allowRoles }: ProtectedRouteProps) {
  const { appUser, artistProfile, loading, error } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // NEVER redirect while loading — this is the exact bug your spec
    // warned about (§25): redirecting on a still-loading, temporarily
    // undefined user causes a flash-redirect-to-login even for people
    // who ARE logged in.
    if (loading) return;

    if (!appUser) {
      // Preserve exactly what the person was trying to reach — e.g.
      // /commissions/request?artistId=... — so login/register can send
      // them straight back instead of dropping them on a generic home.
      const query = searchParams.toString();
      const intended = query ? `${pathname}?${query}` : pathname;
      router.replace(`/login?redirect=${encodeURIComponent(intended)}` as any);
      return;
    }
    if (allowRoles && !appUser.roles.some((r) => allowRoles.includes(r))) {
      // Logged in, but wrong role — send to their own correct home
      // rather than a scary blank error page.
      router.replace(
        resolveAuthDestination({
          status: 'ok',
          user: appUser,
          artistProfile: artistProfile ?? { exists: false, isComplete: false, slug: null },
        }),
      );
    }
  }, [loading, appUser, allowRoles, router, pathname, searchParams]);

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
