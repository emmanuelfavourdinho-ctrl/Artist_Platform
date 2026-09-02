'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useState } from 'react';

import { useScrolled } from '../../hooks/useScrolled';

// Discover and Marketplace both point at /gallery for now — that's the
// only real browsing page built so far. Artists and Community have no
// page yet, so they point home rather than a route that doesn't exist
// (Next's typed routes would fail the build on a fabricated path).
const NAV_LINKS: { label: string; href: Route }[] = [
  { label: 'Discover', href: '/gallery' },
  { label: 'Artists', href: '/' },
  { label: 'Marketplace', href: '/gallery' },
  { label: 'Community', href: '/' },
];

/*
  Explainer: this navbar starts see-through so the hero photo shows
  through it. `useScrolled` tells us the moment the user scrolls past the
  hero — at that point we fade in a solid charcoal background behind the
  nav so text on the next section stays easy to read. On phones, the
  link list collapses into a single "Menu" button that opens a full-
  screen panel.
*/
export function Navbar() {
  const scrolled = useScrolled(40);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ease-cinematic ${
        scrolled
          ? 'bg-background/90 backdrop-blur-md border-b border-foreground/10'
          : 'bg-transparent'
      }`}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-content items-center justify-between px-gutter py-5"
      >
        <Link
          href="/"
          className="font-display text-lg tracking-[0.08em] text-foreground focus-visible:outline-2"
        >
          Fine<span className="text-accent">_</span>Arts
        </Link>

        <ul className="hidden items-center gap-9 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <Link
                href={link.href}
                className="text-[13px] font-medium uppercase tracking-[0.12em] text-foreground/80 transition-colors duration-200 hover:text-foreground"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-5 md:flex">
          <button
            type="button"
            aria-label="Search"
            className="text-foreground/80 transition-colors duration-200 hover:text-foreground"
          >
            <SearchIcon />
          </button>
          <Link
            href="/login"
            className="text-[13px] font-medium uppercase tracking-[0.12em] text-foreground/80 transition-colors duration-200 hover:text-foreground"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-full border border-foreground/30 px-5 py-2 text-[13px] font-medium uppercase tracking-[0.12em] text-foreground transition-colors duration-200 hover:border-accent hover:text-accent"
          >
            Join Artist
          </Link>
        </div>

        <button
          type="button"
          className="text-[13px] font-medium uppercase tracking-[0.12em] text-foreground md:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>
      </nav>

      {menuOpen && (
        <div
          id="mobile-menu"
          className="border-t border-foreground/10 bg-background px-gutter pb-10 pt-6 md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="block py-3 text-2xl font-display text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col gap-3 border-t border-foreground/10 pt-6">
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="text-sm uppercase tracking-[0.12em] text-foreground/80"
            >
              Log in
            </Link>
            <Link
              href="/register"
              onClick={() => setMenuOpen(false)}
              className="rounded-full bg-accent px-5 py-3 text-center text-sm font-medium uppercase tracking-[0.12em] text-accent-foreground"
            >
              Join Artist
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 16L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
