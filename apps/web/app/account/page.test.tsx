import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  favorites: vi.fn(),
  orders: vi.fn(),
  marketplace: vi.fn(),
  // Stable reference, like the real AuthContext, so the inbox loader is not recreated every render.
  firebaseUser: { getIdToken: vi.fn() },
}));
vi.mock('../../components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    appUser: { firstName: 'Sam', email: 'sam@example.test', roles: ['BUYER', 'ARTIST'] },
    firebaseUser: mocks.firebaseUser,
    artistProfile: { slug: 'sam-artist' },
    signOut: vi.fn(),
  }),
}));
vi.mock('../../context/CartContext', () => ({
  useCart: () => ({ cart: [{ id: 'art-1' }], totalPrice: '$25.00' }),
}));
vi.mock('../../lib/favoritesApi', () => ({ fetchUserFavorites: mocks.favorites }));
vi.mock('../../lib/ordersApi', () => ({ fetchMyOrders: mocks.orders }));
vi.mock('../../lib/marketplaceApi', () => ({ marketplaceFetch: mocks.marketplace }));

import Page from './page';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.favorites.mockResolvedValue([]);
  mocks.orders.mockResolvedValue([]);
  mocks.marketplace.mockResolvedValue({
    ok: true,
    json: async () => ({ data: [{ unreadCount: 2 }, { unreadCount: 1 }] }),
  });
});

describe('buyer dashboard', () => {
  it('shows real account data, buyer/artist workspace links, and the saved-art empty state', async () => {
    render(<Page />);
    expect(await screen.findByText('3 unread messages')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Studio' })).toHaveAttribute('href', '/studio');
    expect(screen.getByRole('link', { name: 'Public portfolio' })).toHaveAttribute(
      'href',
      '/artists/sam-artist',
    );
    expect(screen.getByRole('link', { name: /Order history/ })).toHaveAttribute('href', '/orders');
    expect(screen.getByText('Current total $25.00')).toBeInTheDocument();
    expect(screen.getByText('You have not saved any artworks yet.')).toBeInTheDocument();
  });

  it('keeps available sections visible when one service fails and shows the saved-art error state', async () => {
    mocks.favorites.mockRejectedValue(new Error('offline'));
    mocks.orders.mockResolvedValue([
      { id: 'o1', orderNumber: 'ORD-7', status: 'PROCESSING', items: [] },
    ]);
    mocks.marketplace.mockResolvedValue({ ok: false, json: async () => ({ message: 'offline' }) });
    render(<Page />);

    // Shown in both the summary card and the "Recently saved" section
    expect(await screen.findAllByText(/Could not load saved artwork/)).toHaveLength(2);
    expect(await screen.findByText(/Latest: ORD-7/)).toBeInTheDocument();

    // Saved artwork and Messages cards both fall back to "Unavailable"
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);

    await waitFor(() => expect(mocks.orders).toHaveBeenCalledTimes(1));
  });

  it('has mobile-friendly full-width cards and usable minimum-height actions', async () => {
    const { container } = render(<Page />);
    expect(await screen.findByText('Saved artwork')).toBeInTheDocument();
    expect(container.querySelector('[aria-label="Account overview"]')).toHaveClass('grid');
    expect(screen.getByRole('link', { name: 'View all saved art' })).toHaveClass('min-h-11');
  });
});
