'use client';

import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { fetchUserFavorites } from '../../lib/favoritesApi';
import { fetchMyOrders, type OrderView } from '../../lib/ordersApi';
import { marketplaceFetch } from '../../lib/marketplaceApi';
import { formatListingPrice, getListingAvailabilityLabel } from '../../lib/listingPricing';
import type { ArtworkSummary } from '../../types/artwork';

type Resource<T> = { data: T | null; loading: boolean; error: boolean };

// `load` must be referentially stable (a module-level function or a useCallback),
// otherwise the effect will re-run on every render.
function useResource<T>(load: () => Promise<T>) {
  const [resource, setResource] = useState<Resource<T>>({
    data: null,
    loading: true,
    error: false,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setResource({ data, loading: false, error: false });
      },
      () => {
        if (!cancelled) setResource((current) => ({ ...current, loading: false, error: true }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, attempt]);

  const reload = useCallback(() => {
    setResource((current) => ({ ...current, loading: true, error: false }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...resource, reload };
}

function AccountContent() {
  const { appUser, firebaseUser, artistProfile, signOut } = useAuth();
  const { cart, totalPrice } = useCart();
  const orders = useResource<OrderView[]>(fetchMyOrders);
  const favorites = useResource<ArtworkSummary[]>(fetchUserFavorites);

  const loadInbox = useCallback(async () => {
    if (!firebaseUser) throw new Error('not_authenticated');
    const response = await marketplaceFetch(firebaseUser, '/messages');
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.message ?? 'Unable to load messages');
    return (result?.data ?? []).reduce(
      (count: number, conversation: { unreadCount?: number }) =>
        count + (conversation.unreadCount ?? 0),
      0,
    );
  }, [firebaseUser]);
  const inbox = useResource<number>(loadInbox);

  if (!appUser) return null;
  const isArtist = appUser.roles.includes('ARTIST');
  const latestOrder = orders.data?.[0];

  return (
    <main className="mx-auto min-h-screen max-w-content px-gutter py-10 sm:py-16">
      <header className="flex flex-col gap-5 border-b border-border/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-accent">
            Your account
          </p>
          <h1 className="mt-2 font-display text-3xl text-foreground sm:text-4xl">
            Welcome, {appUser.firstName}.
          </h1>
          <p className="mt-2 text-sm text-muted">
            Your orders, saved art, messages, and account in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {isArtist && (
            <Link
              href="/studio"
              className="inline-flex min-h-11 items-center rounded-md border border-border/20 px-4 text-sm font-medium text-foreground hover:border-accent"
            >
              Open Studio
            </Link>
          )}
          {isArtist && artistProfile?.slug && (
            <Link
              href={`/artists/${artistProfile.slug}` as ComponentProps<typeof Link>['href']}
              className="inline-flex min-h-11 items-center rounded-md border border-border/20 px-4 text-sm font-medium text-foreground hover:border-accent"
            >
              Public portfolio
            </Link>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-11 px-3 text-sm text-accent underline underline-offset-4"
          >
            Sign out
          </button>
        </div>
      </header>

      <section
        aria-label="Account overview"
        className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <SummaryCard
          title="Orders"
          value={
            orders.loading
              ? 'Loading…'
              : orders.error
                ? 'Unavailable'
                : String(orders.data?.length ?? 0)
          }
          href="/orders"
          detail={
            latestOrder
              ? `Latest: ${latestOrder.orderNumber} · ${latestOrder.status.replaceAll('_', ' ').toLowerCase()}`
              : orders.error
                ? 'Could not load order history.'
                : 'Purchases and delivery updates'
          }
          onRetry={orders.error ? orders.reload : undefined}
        />
        <SummaryCard
          title="Saved artwork"
          value={
            favorites.loading
              ? 'Loading…'
              : favorites.error
                ? 'Unavailable'
                : String(favorites.data?.length ?? 0)
          }
          href="/favorites"
          detail={favorites.error ? 'Could not load saved artwork.' : 'Pieces you have bookmarked'}
          onRetry={favorites.error ? favorites.reload : undefined}
        />
        <SummaryCard
          title="Messages"
          value={inbox.loading ? 'Loading…' : inbox.error ? 'Unavailable' : String(inbox.data ?? 0)}
          href="/messages"
          detail={
            inbox.error
              ? 'Could not load unread message count.'
              : `${inbox.data ?? 0} unread messages`
          }
          onRetry={inbox.error ? inbox.reload : undefined}
        />
        <SummaryCard
          title="Your cart"
          value={String(cart.length)}
          href="/cart"
          detail={
            cart.length && totalPrice
              ? `Current total ${totalPrice}`
              : cart.length
                ? 'Review items ready for checkout'
                : 'No pieces in your cart'
          }
        />
      </section>

      <section className="mt-10 rounded-xl border border-border/10 bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-accent">Your collection</p>
            <h2 className="mt-1 font-display text-2xl text-foreground">Recently saved</h2>
          </div>
          <Link
            href="/favorites"
            className="min-h-11 py-3 text-sm text-accent underline underline-offset-2"
          >
            View all saved art
          </Link>
        </div>
        <div className="mt-5">
          {favorites.loading && (
            <div
              className="grid gap-4 sm:grid-cols-3"
              aria-busy="true"
              aria-label="Loading saved artwork"
            >
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-lg bg-foreground/5" />
              ))}
            </div>
          )}
          {favorites.error && <ResourceError label="Saved artwork" retry={favorites.reload} />}
          {!favorites.loading && !favorites.error && favorites.data?.length === 0 && (
            <EmptyState
              text="You have not saved any artworks yet."
              href="/gallery"
              link="Explore the gallery"
            />
          )}
          {!favorites.loading && !favorites.error && Boolean(favorites.data?.length) && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {favorites.data!.slice(0, 3).map((artwork) => (
                <Link
                  key={artwork.id}
                  href={`/artwork/${artwork.slug}` as ComponentProps<typeof Link>['href']}
                  className="group overflow-hidden rounded-lg border border-border/10 transition hover:border-accent"
                >
                  <div className="relative aspect-[4/3] bg-foreground/5">
                    {artwork.image && (
                      <Image
                        src={artwork.image.url}
                        alt={artwork.image.altText ?? artwork.title}
                        fill
                        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                        className="object-cover transition group-hover:scale-[1.02]"
                      />
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-display text-base text-foreground">{artwork.title}</h3>
                    <p className="mt-1 text-sm text-muted">{artwork.artist.name}</p>
                    <div className="mt-2 flex justify-between gap-2 text-sm">
                      <span>{formatListingPrice(artwork.price, artwork.currency)}</span>
                      <span className="text-xs text-muted">
                        {getListingAvailabilityLabel(artwork.currency, artwork.available)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2" aria-label="Account links">
        <Link
          href="/orders"
          className="rounded-xl border border-border/10 p-5 transition hover:border-accent sm:p-6"
        >
          <h2 className="font-display text-xl text-foreground">Order history</h2>
          <p className="mt-2 text-sm text-muted">
            Review purchases, delivery activity, and order details.
          </p>
        </Link>
        <Link
          href="/account/profile"
          className="rounded-xl border border-border/10 p-5 transition hover:border-accent sm:p-6"
        >
          <h2 className="font-display text-xl text-foreground">Profile and security</h2>
          <p className="mt-2 text-sm text-muted">
            Update your account details and sign-in security.
          </p>
        </Link>
        <Link
          href="/gallery"
          className="rounded-xl border border-border/10 p-5 transition hover:border-accent sm:p-6"
        >
          <h2 className="font-display text-xl text-foreground">Discover art</h2>
          <p className="mt-2 text-sm text-muted">Explore artists and original work.</p>
        </Link>
        {isArtist && (
          <Link
            href="/studio"
            className="rounded-xl border border-border/10 p-5 transition hover:border-accent sm:p-6"
          >
            <h2 className="font-display text-xl text-foreground">Artist workspace</h2>
            <p className="mt-2 text-sm text-muted">
              Manage your portfolio, commissions, and artist profile.
            </p>
          </Link>
        )}
      </section>
    </main>
  );
}

function SummaryCard({
  title,
  value,
  href,
  detail,
  onRetry,
}: {
  title: string;
  value: string;
  href: string;
  detail: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-36 flex-col rounded-xl border border-border/10 bg-surface p-5">
      <Link
        href={href as ComponentProps<typeof Link>['href']}
        className="group rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="text-xs font-medium uppercase tracking-[0.17em] text-muted">{title}</span>
        <span className="mt-2 block font-display text-3xl text-foreground group-hover:text-accent">
          {value}
        </span>
        <span className="mt-2 block text-xs text-muted">{detail}</span>
      </Link>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-auto min-h-10 self-start pt-2 text-xs text-accent underline underline-offset-2"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function ResourceError({ label, retry }: { label: string; retry: () => void }) {
  return (
    <div role="status" className="rounded-lg border border-border/10 p-6 text-sm text-muted">
      Could not load {label.toLowerCase()}.{' '}
      <button
        type="button"
        onClick={retry}
        className="ml-1 text-accent underline underline-offset-2"
      >
        Try again
      </button>
    </div>
  );
}

function EmptyState({ text, href, link }: { text: string; href: string; link: string }) {
  return (
    <div className="rounded-lg border border-border/10 p-8 text-center">
      <p className="text-sm text-muted">{text}</p>
      <Link
        href={href as ComponentProps<typeof Link>['href']}
        className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-2"
      >
        {link}
      </Link>
    </div>
  );
}

export default function AccountPage() {
  return (
    <ProtectedRoute>
      <AccountContent />
    </ProtectedRoute>
  );
}
