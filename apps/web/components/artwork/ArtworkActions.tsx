'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { fetchUserFavorites, toggleFavoriteApi } from '../../lib/favoritesApi';

interface ArtworkActionsProps {
  artworkId: string;
  title: string;
  price: string;
  currency: string;
  available: boolean;
  imageUrl: string | null;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.6-10-9.1C.5 8 2.2 4.5 5.7 4c2.1-.3 4.1.7 5.3 2.4C12.2 4.7 14.2 3.7 16.3 4c3.5.5 5.2 4 3.7 7.4-2.5 4.5-10 9.1-10 9.1Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArtworkActions({
  artworkId,
  title,
  price,
  currency,
  available,
  imageUrl,
}: ArtworkActionsProps) {
  const router = useRouter();
  const { appUser, loading: authLoading } = useAuth();
  const { cart, addToCart } = useCart();

  const [favorited, setFavorited] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  const inCart = cart.some((item) => item.id === artworkId);

  // Figures out whether THIS artwork is already favorited by checking
  // the user's real favorites list — no backend change needed, since
  // we already have a working, authenticated GET /favorites. If this
  // check fails for any reason, we simply leave the button showing
  // "unfavorited" rather than blocking the page over it.
  useEffect(() => {
    if (!appUser) return;
    let cancelled = false;
    fetchUserFavorites()
      .then((favorites) => {
        if (!cancelled) setFavorited(favorites.some((f) => f.id === artworkId));
      })
      .catch(() => {
        /* non-critical — button just stays in its default state */
      });
    return () => {
      cancelled = true;
    };
  }, [appUser, artworkId]);

  function handleAddToCart() {
    if (!available || inCart) return;
    addToCart({ id: artworkId, title, price, currency, imageUrl: imageUrl ?? '' });
  }

  async function handleToggleFavorite() {
    // Favoriting is a protected action per the platform's own rule:
    // visitors get sent through authentication rather than a silent
    // failure or a fake success.
    if (!appUser) {
      router.push('/login');
      return;
    }
    setFavoriteBusy(true);
    setFavoriteError(null);
    try {
      const isNowFavorited = await toggleFavoriteApi(artworkId);
      setFavorited(isNowFavorited);
    } catch {
      setFavoriteError('Could not update favorites. Try again.');
    } finally {
      setFavoriteBusy(false);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <button
        type="button"
        onClick={handleAddToCart}
        disabled={!available || inCart}
        className={`flex-1 rounded-full px-7 py-3.5 text-sm font-medium transition ${
          !available || inCart
            ? 'cursor-not-allowed bg-foreground/15 text-foreground/50'
            : 'bg-accent text-background hover:opacity-90'
        }`}
      >
        {!available ? 'Sold' : inCart ? 'In Cart' : 'Add to Cart'}
      </button>

      <button
        type="button"
        onClick={() => void handleToggleFavorite()}
        disabled={favoriteBusy || authLoading}
        aria-pressed={favorited}
        className={`flex items-center justify-center gap-2 rounded-full border px-7 py-3.5 text-sm font-medium transition ${
          favorited
            ? 'border-accent text-accent'
            : 'border-foreground/15 text-foreground/70 hover:border-accent hover:text-accent'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <HeartIcon filled={favorited} />
        {favorited ? 'Favorited' : 'Favorite'}
      </button>

      {favoriteError && <p className="text-xs text-red-500 sm:self-center">{favoriteError}</p>}
    </div>
  );
}
