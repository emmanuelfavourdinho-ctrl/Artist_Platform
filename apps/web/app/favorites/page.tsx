'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { fetchUserFavorites, toggleFavoriteApi } from '@/lib/favoritesApi';

export default function FavoritesPage() {
  const [artworks, setArtworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserFavorites()
      .then((data) => setArtworks(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const handleRemove = async (artworkId: string) => {
    // Optimistic UI update
    setArtworks((prev) => prev.filter((a) => a.id !== artworkId));
    try {
      await toggleFavoriteApi(artworkId);
    } catch {
      // Revert if API fails
      fetchUserFavorites().then(setArtworks);
    }
  };

  return (
    <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--foreground))] px-[var(--container-gutter)] py-12">
      <header className="mb-12 border-b border-[rgb(var(--border)/0.12)] pb-8">
        <span className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--accent))] font-medium">
          Personal Collection
        </span>
        <h1 className="font-['Fraunces'] text-4xl md:text-6xl font-normal mt-2 tracking-tight">
          Saved Artworks
        </h1>
      </header>

      {loading ? (
        <div className="text-center py-20 text-[rgb(var(--muted))] font-mono text-sm">
          Loading saved pieces...
        </div>
      ) : artworks.length === 0 ? (
        <div className="text-center py-24 bg-[rgb(var(--surface))] rounded-[var(--radius-lg)] border border-[rgb(var(--border)/0.05)]">
          <p className="font-['Fraunces'] text-xl text-[rgb(var(--muted))]">
            Your collection is empty.
          </p>
          <Link
            href="/gallery"
            className="inline-block mt-6 px-6 py-2.5 bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] font-medium text-sm rounded-[var(--radius-sm)] transition-opacity hover:opacity-90"
          >
            Explore Gallery
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {artworks.map((art) => (
            <article
              key={art.id}
              className="group bg-[rgb(var(--surface))] rounded-[var(--radius-md)] overflow-hidden border border-[rgb(var(--border)/0.06)] relative flex flex-col"
            >
              <button
                onClick={() => handleRemove(art.id)}
                title="Remove from favorites"
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-[rgb(var(--background)/0.8)] text-[rgb(var(--accent))] hover:bg-[rgb(var(--background))] transition-colors"
              >
                ♥
              </button>

              <div className="relative aspect-[4/5] overflow-hidden bg-[rgb(var(--background))]">
                <Image
                  src={art.imageUrl}
                  alt={art.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-700 ease-[var(--ease-cinematic)]"
                />
              </div>

              <div className="p-5 flex flex-col justify-between flex-1">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-[rgb(var(--muted))] font-mono">
                    {art.medium?.name ?? 'Original Work'}
                  </span>
                  <h3 className="font-['Fraunces'] text-lg font-normal mt-1 text-[rgb(var(--foreground))]">
                    {art.title}
                  </h3>
                </div>
                <div className="mt-4 pt-4 border-t border-[rgb(var(--border)/0.06)] flex justify-between items-center">
                  <span className="text-sm font-semibold tracking-tight">
                    {art.currency} ${Number(art.price).toLocaleString()}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
