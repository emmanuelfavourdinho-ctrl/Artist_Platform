'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { AdminSessionProvider, useAdminSession } from '../../components/admin/AdminSessionContext';
import { STAFF_ROLE_NAMES } from '../../lib/adminApi';

/*
  Explainer: one config drives both the desktop sidebar and the mobile
  drawer. An item with an `href` is a real, working page. An item without
  one is a planned section whose backend/page does not exist yet — it is
  rendered as clearly-labelled, non-interactive text ("Soon") rather than
  a link to nowhere. To switch a planned section on, add its `href` here;
  nothing else needs to change.
*/
interface NavItem {
  label: string;
  href?: string;
  /** Permission needed to see this item (checked again by the API). */
  permission: string;
}
interface NavGroup {
  heading: string;
  items: NavItem[];
}

const ADMIN_NAV: NavGroup[] = [
  {
    heading: 'Workspace',
    items: [
      { label: 'Overview', href: '/admin', permission: 'admin.access' },
      { label: 'Analytics', href: '/admin/analytics', permission: 'finance.view' },
    ],
  },
  {
    heading: 'Marketplace',
    items: [
      { label: 'Users', href: '/admin/users', permission: 'users.view' },
      {
        label: 'Artist Verification',
        href: '/admin/artist-verification',
        permission: 'artists.review',
      },
      { label: 'Artwork Moderation', href: '/admin/artworks', permission: 'artworks.moderate' },
      { label: 'Orders & Payments', href: '/admin/orders', permission: 'finance.view' },
      { label: 'Commissions', permission: 'users.view' },
    ],
  },
  {
    heading: 'Trust & Support',
    items: [
      { label: 'Reports & Investigations', href: '/admin/reports', permission: 'reports.manage' },
      { label: 'Reviews', href: '/admin/reviews', permission: 'reviews.moderate' },
      { label: 'Contact Messages', href: '/admin/messages', permission: 'support.manage' },
    ],
  },
  {
    heading: 'Platform',
    items: [
      { label: 'Financial Reports', permission: 'finance.view' },
      { label: 'Audit Logs', href: '/admin/audit-logs', permission: 'audit.view' },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  // Overview lives at exactly /admin; every other item owns its subtree.
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { can } = useAdminSession();
  const groups = ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(item.permission)),
  })).filter((group) => group.items.length > 0);

  return (
    <nav aria-label="Admin" className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.heading}>
          <p className="px-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
            {group.heading}
          </p>
          <ul className="mt-2 flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.label}>
                {item.href ? (
                  <Link
                    href={item.href as Route}
                    onClick={onNavigate}
                    aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                    className={`block rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                      isActive(pathname, item.href)
                        ? 'bg-surface-raised text-foreground'
                        : 'text-foreground/70 hover:bg-surface-raised hover:text-foreground'
                    }`}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm text-foreground/35"
                  >
                    {item.label}
                    <span className="text-[10px] uppercase tracking-[0.12em]">Soon</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function AdminChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer after navigating, and on Escape.
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen bg-background">
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-border/10 bg-surface px-gutter py-4 lg:hidden">
        <div>
          <p className="font-display text-base text-foreground">Fine Arts</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Admin</p>
        </div>
        <button
          type="button"
          aria-expanded={drawerOpen}
          aria-controls="admin-drawer"
          onClick={() => setDrawerOpen((open) => !open)}
          className="rounded-md px-2 py-1 text-xs font-medium uppercase tracking-[0.12em] text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {drawerOpen ? 'Close' : 'Menu'}
        </button>
      </div>

      {drawerOpen && (
        <div
          id="admin-drawer"
          className="fixed inset-0 top-[65px] z-30 overflow-y-auto bg-background px-gutter py-8 lg:hidden"
        >
          <NavList pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
          <Link
            href="/"
            className="mt-8 block text-xs text-muted transition-colors hover:text-accent"
          >
            ← Back to site
          </Link>
        </div>
      )}

      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border/10 bg-surface px-4 py-8 lg:flex">
        <div className="px-3">
          <p className="font-display text-lg text-foreground">Fine Arts</p>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">Admin</p>
        </div>
        <div className="mt-10">
          <NavList pathname={pathname} />
        </div>
        <div className="mt-auto px-3 pt-10">
          <Link href="/" className="text-xs text-muted transition-colors hover:text-accent">
            ← Back to site
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <main className="px-gutter pb-16 pt-24 sm:px-10 lg:pt-12">{children}</main>
      </div>
    </div>
  );
}

// Layout-level guard so every current and future /admin page is covered
// by default. This is UX only — the real boundary is requireAdmin on the
// API; a user who bypasses this still gets 403s from every admin endpoint.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ProtectedRoute allowRoles={STAFF_ROLE_NAMES}>
        <AdminSessionProvider>
          <AdminChrome>{children}</AdminChrome>
        </AdminSessionProvider>
      </ProtectedRoute>
    </Suspense>
  );
}
