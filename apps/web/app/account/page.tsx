'use client';

import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { fetchUserFavorites, toggleFavoriteApi } from '../../lib/favoritesApi';
import { fetchMyOrders, type OrderView } from '../../lib/ordersApi';
import { marketplaceFetch } from '../../lib/marketplaceApi';
import { formatListingPrice, getListingAvailabilityLabel } from '../../lib/listingPricing';
import { getOrderStatusMeta } from '../../lib/orderStatus';
import { getCommissionStatusMeta } from '../../lib/commissionStatus';
import type { ArtworkSummary } from '../../types/artwork';

type Resource<T> = { data: T | null; loading: boolean; error: boolean };
type Href = ComponentProps<typeof Link>['href'];

// Only the fields of GET /messages this page reads. The full shape lives in
// app/messages/page.tsx, which remains the owner of chat behavior.
interface ConversationSummary {
  id: string;
  participant: { name: string };
  commissionRequest: { id: string; title: string; status: string } | null;
  artwork: { title: string } | null;
  order: { orderNumber: string } | null;
  messages: {
    body: string;
    createdAt: string;
    deletedAt?: string | null;
    hasAttachment?: boolean;
    attachmentName?: string | null;
  }[];
  unreadCount?: number;
}

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

  // Apply a local change after a successful mutation so the UI never shows
  // stale data while waiting for a refetch.
  const mutate = useCallback((update: (current: T | null) => T | null) => {
    setResource((current) => ({ ...current, data: update(current.data) }));
  }, []);

  return { ...resource, reload, mutate };
}

function conversationPreview(conversation: ConversationSummary) {
  const last = conversation.messages[0];
  if (!last) return 'No messages yet';
  if (last.deletedAt) return 'This message was deleted';
  if (last.hasAttachment) return `Attachment: ${last.attachmentName ?? 'File'}`;
  return last.body || 'Attachment';
}

function conversationContext(conversation: ConversationSummary) {
  if (conversation.commissionRequest) return conversation.commissionRequest.title;
  if (conversation.artwork) return conversation.artwork.title;
  if (conversation.order) return `Order ${conversation.order.orderNumber}`;
  return 'General conversation';
}

function AccountContent() {
  const { appUser, firebaseUser, artistProfile } = useAuth();
  const { cart, totalPrice } = useCart();
  const orders = useResource<OrderView[]>(fetchMyOrders);
  const favorites = useResource<ArtworkSummary[]>(fetchUserFavorites);
  const [removing, setRemoving] = useState<string[]>([]);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // One request feeds the unread count, the recent conversations and the
  // commission conversations below.
  const loadConversations = useCallback(async (): Promise<ConversationSummary[]> => {
    if (!firebaseUser) throw new Error('not_authenticated');
    const response = await marketplaceFetch(firebaseUser, '/messages');
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.message ?? 'Unable to load messages');
    return (result?.data ?? []) as ConversationSummary[];
  }, [firebaseUser]);
  const conversations = useResource<ConversationSummary[]>(loadConversations);

  async function removeFavorite(artworkId: string) {
    if (removing.includes(artworkId)) return;
    setRemoving((ids) => [...ids, artworkId]);
    setRemoveError(null);
    try {
      const stillSaved = await toggleFavoriteApi(artworkId);
      if (stillSaved) favorites.reload();
      else favorites.mutate((list) => (list ?? []).filter((artwork) => artwork.id !== artworkId));
    } catch {
      setRemoveError('Could not remove that artwork. Please try again.');
    } finally {
      setRemoving((ids) => ids.filter((id) => id !== artworkId));
    }
  }

  if (!appUser) return null;
  const isArtist = appUser.roles.includes('ARTIST');
  const latestOrder = orders.data?.[0];
  const unreadTotal = (conversations.data ?? []).reduce(
    (count, conversation) => count + (conversation.unreadCount ?? 0),
    0,
  );
  const commissionConversations = (conversations.data ?? []).filter(
    (conversation) => conversation.commissionRequest,
  );

  return (
    <>
      <main className="mx-auto w-full max-w-content px-gutter py-8 sm:py-10">
        <header className="flex flex-col gap-5 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl text-foreground sm:text-4xl">
              Welcome, {appUser.firstName}.
            </h1>
            <p className="mt-2 text-sm text-muted">
              Your orders, saved art, and conversations with artists.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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
                href={`/artists/${artistProfile.slug}` as Href}
                className="inline-flex min-h-11 items-center rounded-md border border-border/20 px-4 text-sm font-medium text-foreground hover:border-accent"
              >
                Public portfolio
              </Link>
            )}
          </div>
        </header>

        <section aria-label="Account overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                ? `Latest: ${latestOrder.orderNumber}, ${getOrderStatusMeta(latestOrder.status).label.toLowerCase()}`
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
            detail={
              favorites.error ? 'Could not load saved artwork.' : 'Pieces you have bookmarked'
            }
            onRetry={favorites.error ? favorites.reload : undefined}
          />
          <SummaryCard
            title="Messages"
            value={
              conversations.loading
                ? 'Loading…'
                : conversations.error
                  ? 'Unavailable'
                  : String(unreadTotal)
            }
            href="/messages"
            detail={
              conversations.error
                ? 'Could not load unread message count.'
                : unreadTotal === 1
                  ? '1 unread message'
                  : `${unreadTotal} unread messages`
            }
            onRetry={conversations.error ? conversations.reload : undefined}
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

        <div className="mt-10 grid gap-10 xl:grid-cols-3">
          <div className="space-y-10 xl:col-span-2">
            <Panel title="Recent orders" linkHref="/orders" linkLabel="View all orders" noMargin>
              {orders.loading && <Skeleton label="Loading orders" rows={2} />}
              {orders.error && <ResourceError label="Orders" retry={orders.reload} />}
              {!orders.loading && !orders.error && orders.data?.length === 0 && (
                <EmptyState
                  text="You have not placed any orders yet."
                  href="/gallery"
                  link="Explore the gallery"
                />
              )}
              {!orders.loading && !orders.error && Boolean(orders.data?.length) && (
                <ul className="divide-y divide-border/10">
                  {orders.data!.slice(0, 3).map((order) => {
                    const status = getOrderStatusMeta(order.status);
                    return (
                      <li key={order.id}>
                        <Link
                          href="/orders"
                          className="flex flex-wrap items-start justify-between gap-3 py-4 hover:bg-foreground/[0.02]"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {order.orderNumber}
                            </p>
                            <p className="mt-1 max-w-prose truncate text-sm text-muted">
                              {order.items
                                .map(
                                  (item) => `${item.titleSnapshot} by ${item.artistNameSnapshot}`,
                                )
                                .join(', ')}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-sm text-foreground">
                              {order.currency} {order.totalAmount}
                            </span>
                            <StatusBadge tone={status.tone} label={status.label} />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <Panel
              title="Saved artwork"
              linkHref="/favorites"
              linkLabel="View all saved art"
              noMargin
            >
              {favorites.loading && <Skeleton label="Loading saved artwork" rows={1} columns />}
              {favorites.error && <ResourceError label="Saved artwork" retry={favorites.reload} />}
              {removeError && (
                <p role="alert" className="mb-3 text-sm text-red-400">
                  {removeError}
                </p>
              )}
              {!favorites.loading && !favorites.error && favorites.data?.length === 0 && (
                <EmptyState
                  text="You have not saved any artworks yet."
                  href="/gallery"
                  link="Explore the gallery"
                />
              )}
              {!favorites.loading && !favorites.error && Boolean(favorites.data?.length) && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {favorites.data!.slice(0, 3).map((artwork) => {
                    const imageUrl = artwork.image?.url?.trim();
                    return (
                      <div
                        key={artwork.id}
                        className="overflow-hidden rounded-lg border border-border/10 transition hover:border-accent"
                      >
                        <Link href={`/artwork/${artwork.slug}` as Href} className="group block">
                          <div className="relative aspect-[4/3] bg-foreground/5">
                            {imageUrl ? (
                              <Image
                                src={imageUrl}
                                alt={artwork.image?.altText ?? artwork.title}
                                fill
                                sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                                className="object-cover transition group-hover:scale-[1.02]"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-muted">
                                No image available
                              </div>
                            )}
                          </div>
                          <div className="p-4 pb-2">
                            <h3 className="font-display text-base text-foreground">
                              {artwork.title}
                            </h3>
                            <p className="mt-1 text-sm text-muted">{artwork.artist.name}</p>
                            <div className="mt-2 flex justify-between gap-2 text-sm">
                              <span>{formatListingPrice(artwork.price, artwork.currency)}</span>
                              <span className="text-xs text-muted">
                                {getListingAvailabilityLabel(artwork.currency, artwork.available)}
                              </span>
                            </div>
                          </div>
                        </Link>
                        <div className="px-4 pb-3">
                          <button
                            type="button"
                            onClick={() => void removeFavorite(artwork.id)}
                            disabled={removing.includes(artwork.id)}
                            className="min-h-10 text-xs text-muted underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                          >
                            {removing.includes(artwork.id) ? 'Removing…' : 'Remove from saved'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-10">
            <Panel
              title="Recent conversations"
              linkHref="/messages"
              linkLabel="Open messages"
              noMargin
            >
              {conversations.loading && <Skeleton label="Loading conversations" rows={3} />}
              {conversations.error && (
                <ResourceError label="Conversations" retry={conversations.reload} />
              )}
              {!conversations.loading &&
                !conversations.error &&
                conversations.data?.length === 0 && (
                  <EmptyState
                    text="No conversations yet. Message an artist from their profile or an artwork page."
                    href="/gallery"
                    link="Browse artists and artwork"
                  />
                )}
              {!conversations.loading &&
                !conversations.error &&
                Boolean(conversations.data?.length) && (
                  <ul className="divide-y divide-border/10">
                    {conversations.data!.slice(0, 4).map((conversation) => (
                      <li key={conversation.id}>
                        <Link
                          href={
                            `/messages?conversationId=${encodeURIComponent(conversation.id)}` as Href
                          }
                          className="flex items-start justify-between gap-3 py-3 hover:bg-foreground/[0.02]"
                        >
                          <div className="min-w-0">
                            <p
                              className={`truncate text-sm ${
                                conversation.unreadCount
                                  ? 'font-semibold text-foreground'
                                  : 'font-medium text-foreground'
                              }`}
                            >
                              {conversation.participant.name}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted">
                              {conversationPreview(conversation)}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted">
                              {conversationContext(conversation)}
                            </p>
                          </div>
                          {Boolean(conversation.unreadCount) && (
                            <span
                              aria-label={`${conversation.unreadCount} unread messages`}
                              className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground"
                            >
                              {conversation.unreadCount}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
            </Panel>

            <Panel
              title="Commissions"
              linkHref="/commissions"
              linkLabel="How commissions work"
              noMargin
            >
              {conversations.loading && <Skeleton label="Loading commissions" rows={2} />}
              {conversations.error && (
                <ResourceError label="Commissions" retry={conversations.reload} />
              )}
              {!conversations.loading &&
                !conversations.error &&
                commissionConversations.length === 0 && (
                  <EmptyState
                    text="No commission conversations yet. Start from an artist's profile to request custom work."
                    href="/gallery"
                    link="Find an artist"
                  />
                )}
              {!conversations.loading &&
                !conversations.error &&
                commissionConversations.length > 0 && (
                  <ul className="divide-y divide-border/10">
                    {commissionConversations.slice(0, 4).map((conversation) => {
                      const request = conversation.commissionRequest!;
                      const status = getCommissionStatusMeta(request.status);
                      return (
                        <li key={conversation.id}>
                          <Link
                            href={
                              `/messages?conversationId=${encodeURIComponent(conversation.id)}` as Href
                            }
                            className="flex items-start justify-between gap-3 py-3 hover:bg-foreground/[0.02]"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {request.title}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted">
                                With {conversation.participant.name}
                              </p>
                            </div>
                            <StatusBadge tone={status.tone} label={status.label} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              <p className="mt-4 text-xs text-muted">
                Shows commission requests that have an open conversation with the artist.
              </p>
            </Panel>
          </div>
        </div>
      </main>
    </>
  );
}

function Panel({
  title,
  linkHref,
  linkLabel,
  noMargin,
  children,
}: {
  title: string;
  linkHref: string;
  linkLabel: string;
  noMargin?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`${noMargin ? '' : 'mt-10'} rounded-xl border border-border/10 bg-surface p-5 sm:p-7`}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl text-foreground">{title}</h2>
        <Link
          href={linkHref as Href}
          className="min-h-11 py-3 text-sm text-accent underline underline-offset-2"
        >
          {linkLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}

function Skeleton({ label, rows, columns }: { label: string; rows: number; columns?: boolean }) {
  return (
    <div
      className={columns ? 'grid gap-4 sm:grid-cols-3' : 'space-y-3'}
      aria-busy="true"
      aria-label={label}
    >
      {Array.from({ length: columns ? 3 : rows }, (_, i) => (
        <div
          key={i}
          className={`animate-pulse rounded-lg bg-foreground/5 ${columns ? 'h-48' : 'h-14'}`}
        />
      ))}
    </div>
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
        href={href as Href}
        className="group rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="text-sm text-muted">{title}</span>
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
        href={href as Href}
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
