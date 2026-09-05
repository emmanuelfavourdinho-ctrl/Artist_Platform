'use client';

import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { useAuth } from '../../context/AuthContext';
import { fetchUserFavorites } from '../../lib/favoritesApi';
import type { ArtworkSummary } from '../../types/artwork';

function FavoritesPreview() {
  const [favorites, setFavorites] = useState<ArtworkSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchUserFavorites()
      .then((data) => {
        if (!cancelled) setFavorites(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p className="text-sm text-muted">
        We couldn&apos;t load your saved artwork right now.{' '}
        <Link href="/favorites" className="text-accent underline underline-offset-2">
          View favorites
        </Link>
      </p>
    );
  }

  // Explicit control-flow check: if favorites is still null, render skeleton loading
  if (favorites === null) {
    return (
      <div className="grid gap-4 sm:grid-cols-3" aria-busy="true" aria-label="Loading favorites">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-lg bg-foreground/5" />
        ))}
      </div>
    );
  }

  // TypeScript now safely knows `favorites` is ArtworkSummary[]
  if (favorites.length === 0) {
    return (
      <div className="rounded-lg border border-border/10 p-8 text-center">
        <p className="text-sm text-muted">You haven&apos;t saved any artworks yet.</p>
        <Link
          href="/gallery"
          className="mt-3 inline-block text-sm font-medium text-accent underline underline-offset-2"
        >
          Explore the Gallery
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {favorites.slice(0, 3).map((artwork) => (
        <Link
          key={artwork.id}
          href={`/artwork/${artwork.slug}` as ComponentProps<typeof Link>['href']}
          className="group overflow-hidden rounded-lg border border-border/10 transition hover:border-accent"
        >
          <div className="relative aspect-[4/5] bg-foreground/5">
            {artwork.image && (
              <Image
                src={artwork.image.url}
                alt={artwork.image.altText ?? artwork.title}
                fill
                sizes="(min-width: 640px) 33vw, 100vw"
                className="object-cover transition group-hover:scale-[1.02]"
              />
            )}
          </div>
          <div className="p-4">
            <h3 className="font-display text-base text-foreground">{artwork.title}</h3>
            <p className="mt-1 text-sm text-muted">{artwork.artist.name}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm text-foreground">
                {artwork.currency} {Number(artwork.price).toLocaleString()}
              </span>
              {!artwork.available && (
                <span className="text-xs uppercase tracking-wide text-muted">Sold</span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function AccountContent() {
  const { appUser, signOut } = useAuth();

  if (!appUser) return null;

  return (
    <main className="mx-auto min-h-screen max-w-content px-gutter py-16 sm:py-24">
      <div className="flex flex-col gap-6 border-b border-border/10 pb-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">
            Buyer account
          </p>
          <h1 className="mt-3 font-display text-4xl text-foreground">
            Welcome, {appUser.firstName}.
          </h1>
          <p className="mt-3 text-sm text-muted">{appUser.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="self-start text-sm font-medium text-accent underline underline-offset-4 sm:self-auto"
        >
          Sign out
        </button>
      </div>

      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl text-foreground">Recently saved</h2>
          <Link href="/favorites" className="text-sm text-accent underline underline-offset-2">
            View all
          </Link>
        </div>
        <div className="mt-4">
          <FavoritesPreview />
        </div>
      </section>

      <section
        className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Account areas"
      >
        <Link
          href="/orders"
          className="rounded-lg border border-border/10 p-6 transition hover:border-accent"
        >
          <h2 className="font-display text-xl text-foreground">Orders</h2>
          <p className="mt-2 text-sm text-muted">Track purchases and delivery activity.</p>
        </Link>
        <Link
          href="/gallery"
          className="rounded-lg border border-border/10 p-6 transition hover:border-accent"
        >
          <h2 className="font-display text-xl text-foreground">Discover</h2>
          <p className="mt-2 text-sm text-muted">Explore artists and original work.</p>
        </Link>
        <Link
          href={'/account/profile' as ComponentProps<typeof Link>['href']}
          className="rounded-lg border border-border/10 p-6 transition hover:border-accent"
        >
          <h2 className="font-display text-xl text-foreground">Profile</h2>
          <p className="mt-2 text-sm text-muted">Update your name, phone, and password.</p>
        </Link>
      </section>
    </main>
  );
}

export default function AccountPage() {
  return (
    <ProtectedRoute>
      <AccountContent />
    </ProtectedRoute>
  );
}
