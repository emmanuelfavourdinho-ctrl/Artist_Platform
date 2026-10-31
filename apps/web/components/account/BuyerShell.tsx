'use client';

import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

type Href = ComponentProps<typeof Link>['href'];

/* ---------- Icons (inline SVG, same approach as components/layout/Navbar) ---------- */

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const HomeIcon = () => (
  <Icon>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h14V9.5" />
    <path d="M10 20v-5h4v5" />
  </Icon>
);
const OrdersIcon = () => (
  <Icon>
    <path d="M6 7h12l1 13H5L6 7Z" />
    <path d="M9 10V6a3 3 0 0 1 6 0v4" />
  </Icon>
);
const HeartIcon = () => (
  <Icon>
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />
  </Icon>
);
const ChatIcon = () => (
  <Icon>
    <path d="M4 5h16v11H9l-5 4V5Z" />
  </Icon>
);
const GalleryIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m21 16-5-5-8 8" />
  </Icon>
);
const UserIcon = () => (
  <Icon>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  </Icon>
);
const SettingsIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
  </Icon>
);
const MenuIcon = () => (
  <Icon>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);
const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

/* ---------- Navigation model: every href is an existing page in apps/web/app ---------- */

interface NavItem {
  href: string;
  label: string;
  icon: () => ReactNode;
  exact?: boolean;
}

const OVERVIEW: NavItem = { href: '/account', label: 'Overview', icon: HomeIcon, exact: true };
const ORDERS: NavItem = { href: '/orders', label: 'Orders', icon: OrdersIcon };
const SAVED: NavItem = { href: '/favorites', label: 'Saved', icon: HeartIcon };
const MESSAGES: NavItem = { href: '/messages', label: 'Messages', icon: ChatIcon };
const GALLERY: NavItem = { href: '/gallery', label: 'Gallery', icon: GalleryIcon };
const PROFILE: NavItem = { href: '/account/profile', label: 'Profile', icon: UserIcon };
const SETTINGS: NavItem = { href: '/account/settings', label: 'Settings', icon: SettingsIcon };

const SIDEBAR_GROUPS: { heading: string; items: NavItem[] }[] = [
  { heading: 'My activity', items: [OVERVIEW, ORDERS, SAVED, MESSAGES] },
  { heading: 'Explore', items: [GALLERY] },
  { heading: 'Account', items: [PROFILE, SETTINGS] },
];

// The most-visited pages, kept to five so labels stay legible on small phones.
const BOTTOM_BAR: NavItem[] = [OVERVIEW, MESSAGES, GALLERY, SAVED, PROFILE];

function isActive(pathname: string, item: NavItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-6">
      {SIDEBAR_GROUPS.map((group) => (
        <div key={group.heading}>
          <p className="px-3 text-xs text-muted">{group.heading}</p>
          <ul className="mt-2 space-y-1">
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href as Href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-md border-l-2 px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                      active
                        ? 'border-accent bg-foreground/5 text-foreground'
                        : 'border-transparent text-muted hover:bg-foreground/[0.03] hover:text-foreground'
                    }`}
                  >
                    <span className={active ? 'text-accent' : undefined}>{item.icon()}</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function UserBlock() {
  const { appUser } = useAuth();
  if (!appUser) return null;
  const initials = `${appUser.firstName?.[0] ?? ''}${appUser.lastName?.[0] ?? ''}`.toUpperCase();
  return (
    <div className="flex items-center gap-3 px-3">
      <div
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-raised text-sm font-medium text-accent ring-1 ring-border/20"
      >
        {initials || 'FA'}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {appUser.firstName} {appUser.lastName}
        </p>
        <p className="text-xs text-muted">Buyer account</p>
      </div>
    </div>
  );
}

export function BuyerShell({ children }: { children: ReactNode }) {
  const { appUser } = useAuth();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer after any navigation.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Escape closes the drawer; page scroll is locked while it is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  // Signed-out visitors and the account-status page keep their own bare layout.
  if (!appUser || pathname.startsWith('/account/status')) return <>{children}</>;

  const current = [...SIDEBAR_GROUPS.flatMap((group) => group.items)].find((item) =>
    isActive(pathname, item),
  );

  return (
    <>
      <div className="flex min-h-dvh">
        {/* Sidebar: tablet and desktop */}
        <aside
          aria-label="Account sidebar"
          className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-8 overflow-y-auto border-r border-border/10 bg-surface px-3 py-6 md:flex"
        >
          <Link
            href="/"
            className="px-3 font-display text-lg tracking-[0.08em] text-foreground focus-visible:outline-2"
          >
            Fine<span className="text-accent">_</span>Arts
          </Link>
          <UserBlock />
          <nav aria-label="Account">
            <NavList pathname={pathname} />
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar: phones */}
          <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border/10 bg-background/95 px-gutter pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] backdrop-blur md:hidden">
            <p className="font-display text-lg text-foreground">{current?.label ?? 'My account'}</p>
            <button
              type="button"
              aria-label="Open account menu"
              aria-expanded={drawerOpen}
              aria-controls="account-drawer"
              onClick={() => setDrawerOpen(true)}
              className="grid h-11 w-11 place-items-center rounded-md text-foreground hover:bg-foreground/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <MenuIcon />
            </button>
          </div>

          <div className="flex-1 pb-24 md:pb-0">{children}</div>
        </div>
      </div>

      {/* Drawer: full menu on phones */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close account menu"
            tabIndex={-1}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/70"
          />
          <div
            id="account-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Account menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-8 overflow-y-auto bg-surface px-3 pb-6 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)]"
          >
            <div className="flex items-center justify-between pr-1">
              <span className="px-3 font-display text-lg tracking-[0.08em] text-foreground">
                Fine<span className="text-accent">_</span>Arts
              </span>
              <button
                type="button"
                autoFocus
                aria-label="Close account menu"
                onClick={() => setDrawerOpen(false)}
                className="grid h-11 w-11 place-items-center rounded-md text-foreground hover:bg-foreground/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <CloseIcon />
              </button>
            </div>
            <UserBlock />
            <nav aria-label="Account">
              <NavList pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
            </nav>
          </div>
        </div>
      )}

      {/* Bottom bar: phones */}
      <nav
        aria-label="Quick links"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/10 bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {BOTTOM_BAR.map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href as Href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    active ? 'text-accent' : 'text-muted hover:text-foreground'
                  }`}
                >
                  {item.icon()}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
