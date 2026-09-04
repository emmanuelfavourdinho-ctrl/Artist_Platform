'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';

const ADMIN_NAV = [{ href: '/admin' as const, label: 'Moderation' }];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile top bar — sidebar content is hidden below sm, this is
          its stand-in trigger, matching the pattern Navbar already uses
          for its own mobile menu button. */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-border/10 bg-surface px-gutter py-4 sm:hidden">
        <div>
          <p className="font-display text-base text-foreground">Artist_Platform</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Admin</p>
        </div>
        <button
          type="button"
          aria-expanded={drawerOpen}
          aria-controls="admin-drawer"
          onClick={() => setDrawerOpen((open) => !open)}
          className="text-xs font-medium uppercase tracking-[0.12em] text-foreground"
        >
          {drawerOpen ? 'Close' : 'Menu'}
        </button>
      </div>

      {drawerOpen && (
        <div
          id="admin-drawer"
          className="fixed inset-0 top-[65px] z-30 bg-background px-gutter py-8 sm:hidden"
        >
          <nav className="flex flex-col gap-1">
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                className="rounded-md px-3 py-3 text-lg font-display text-foreground/90 transition-colors hover:bg-surface-raised hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/"
            onClick={() => setDrawerOpen(false)}
            className="mt-8 block text-xs text-muted transition-colors hover:text-accent"
          >
            ← Back to site
          </Link>
        </div>
      )}

      {/* Desktop sidebar — unchanged from before, just now paired with
          a real mobile equivalent instead of vanishing below sm. */}
      <aside className="hidden w-64 shrink-0 border-r border-border/10 bg-surface px-6 py-8 sm:block">
        <p className="font-display text-lg text-foreground">Artist_Platform</p>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">Admin</p>

        <nav className="mt-10 flex flex-col gap-1">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-10">
          <Link href="/" className="text-xs text-muted transition-colors hover:text-accent">
            ← Back to site
          </Link>
        </div>
      </aside>

      <div className="flex-1">
        <header className="hidden border-b border-border/10 bg-surface px-6 py-4 sm:block sm:px-10">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">
            Creator &amp; Platform Operations
          </p>
        </header>

        <main className="px-gutter pb-10 pt-24 sm:px-10 sm:pt-14">{children}</main>
      </div>
    </div>
  );
}
