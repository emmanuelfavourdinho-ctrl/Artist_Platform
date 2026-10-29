'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { fetchArtistOrderFulfillments } from '../../lib/studioOrdersApi';
import { fetchStudioArtworks, fetchStudioDisputes } from '../../lib/studioApi';

type Destination = { label: string; href: Route; icon: string; badge?: number };

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9M9 20v-6h6v6" />
      </>
    ),
    art: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m21 15-5-5L5 20" />
      </>
    ),
    orders: (
      <>
        <path d="M4 5h16M4 12h16M4 19h10" />
        <circle cx="19" cy="19" r="2" />
      </>
    ),
    earnings: (
      <>
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </>
    ),
    support: (
      <>
        <path d="M4 14v-3a8 8 0 0 1 16 0v3" />
        <path d="M4 14h3v6H6a2 2 0 0 1-2-2v-4Zm16 0h-3v6h1a2 2 0 0 0 2-2v-4ZM12 22h2" />
      </>
    ),
    verification: (
      <>
        <path d="m9 12 2 2 4-4" />
        <circle cx="12" cy="12" r="9" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1 0 2Z" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
    >
      {paths[name] ?? paths.home}
    </svg>
  );
}

function activePath(pathname: string, href: string) {
  return href === '/studio'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function StudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [ordersBadge, setOrdersBadge] = useState(0);
  const [supportBadge, setSupportBadge] = useState(0);
  const [publicProfileHref, setPublicProfileHref] = useState<Route>('/studio/profile');
  const [publicProfileError, setPublicProfileError] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([fetchArtistOrderFulfillments(), fetchStudioDisputes()])
      .then(([orders, disputes]) => {
        if (!live) return;
        setOrdersBadge(
          orders.filter(
            (item) => !item.shippedAt && ['CONFIRMED', 'PROCESSING'].includes(item.order.status),
          ).length,
        );
        setSupportBadge(
          disputes.filter((item) => item.status === 'OPEN' && !item.artistRespondedAt).length,
        );
      })
      .catch(() => {
        if (live) {
          setOrdersBadge(0);
          setSupportBadge(0);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    fetchStudioArtworks()
      .then(({ artist }) => {
        if (live) setPublicProfileHref(`/artists/${artist.slug}` as Route);
      })
      .catch(() => {
        if (live) setPublicProfileError(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const primary: Destination[] = [
    { label: 'Overview', href: '/studio', icon: 'home' },
    { label: 'My Artworks', href: '/studio/artworks', icon: 'art' },
    { label: 'Orders & Delivery', href: '/studio/orders', icon: 'orders', badge: ordersBadge },
    { label: 'Earnings', href: '/studio/earnings', icon: 'earnings' },
    { label: 'Support & Disputes', href: '/studio/support', icon: 'support', badge: supportBadge },
    { label: 'Verification', href: '/studio/verification', icon: 'verification' },
    { label: 'Messages', href: '/messages', icon: 'messages' },
  ];
  const account: Destination[] = [
    { label: 'Artist Profile', href: '/studio/profile', icon: 'profile' },
    { label: 'Settings', href: '/studio/settings', icon: 'settings' },
  ];

  const link = (destination: Destination, compact = false) => {
    const active = activePath(pathname, destination.href);
    return (
      <Link
        key={destination.href}
        href={destination.href}
        aria-current={active ? 'page' : undefined}
        className={`${compact ? 'min-w-0 flex-1 flex-col gap-1 px-1 py-2 text-[10px]' : 'gap-3 px-3 py-2.5 text-sm'} relative flex items-center rounded-md transition-colors ${
          active
            ? 'bg-accent/10 text-accent'
            : 'text-muted hover:bg-surface-raised hover:text-foreground'
        }`}
      >
        <Icon name={destination.icon} />
        <span className={compact ? 'max-w-full truncate' : 'flex-1'}>{destination.label}</span>
        {!!destination.badge && (
          <span
            className={
              compact
                ? 'absolute right-1 top-1 rounded-full bg-accent px-1.5 text-[9px] text-background'
                : 'rounded-full bg-accent px-2 py-0.5 text-[10px] text-background'
            }
          >
            {destination.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border/10 bg-background px-5 py-6 lg:flex">
        <Link href="/studio" className="mb-10 flex items-center gap-3 text-foreground">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/40 font-display text-accent">
            F
          </span>
          <span>
            <span className="block font-display text-lg">Fine Arts</span>
            <span className="block text-[10px] uppercase tracking-[.18em] text-muted">
              Artist Studio
            </span>
          </span>
        </Link>
        <nav aria-label="Artist workspace" className="space-y-1">
          {primary.map((destination) => link(destination))}
        </nav>
        <div className="my-5 border-t border-border/10" />
        <p className="mb-2 px-3 text-[10px] uppercase tracking-[.16em] text-muted">Account</p>
        <nav aria-label="Artist account" className="space-y-1">
          {account.map((destination) => link(destination))}
          <Link
            href={publicProfileHref}
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted hover:bg-surface-raised hover:text-foreground"
          >
            <Icon name="profile" />
            <span>View Public Profile</span>
          </Link>
          {publicProfileError && (
            <p role="status" className="px-3 text-[10px] text-muted">
              Public profile link could not be refreshed.
            </p>
          )}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="border-b border-border/10 px-5 py-3 sm:px-8 lg:hidden">
          <Link href="/studio" className="font-display text-lg">
            Fine Arts <span className="text-xs text-muted">/ Studio</span>
          </Link>
        </header>
        <main className="mx-auto min-h-[calc(100dvh-56px)] max-w-7xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:pt-10 lg:px-10 lg:pb-12">
          {children}
        </main>
      </div>

      <nav
        aria-label="Mobile artist navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border/15 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {primary.map((destination) => link(destination, true))}
      </nav>
    </div>
  );
}
