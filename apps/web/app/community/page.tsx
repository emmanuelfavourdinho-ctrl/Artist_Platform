'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

interface CommunityPost {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  publishedAt: string;
  artist: { slug: string; displayName: string; profileImageUrl: string | null };
  artwork: { slug: string; title: string } | null;
}

export default function CommunityPage() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/community`)
      .then((response) => {
        if (!response.ok) throw new Error('community_failed');
        return response.json();
      })
      .then((body) => setPosts(body.data ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-content px-gutter py-16 sm:py-24">
      <header className="max-w-2xl border-b border-foreground/10 pb-12">
        <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">Community</p>
        <h1 className="mt-3 font-display text-5xl leading-[1.05] text-foreground">
          The people behind the work.
        </h1>
        <p className="mt-5 text-sm leading-7 text-muted">
          Process notes, studio stories, and thoughtful discoveries from artists on Artist_Platform.
        </p>
      </header>

      {loading && <p className="py-20 text-sm text-muted">Loading community stories…</p>}
      {error && (
        <p className="py-20 text-sm text-red-400">
          Community is unavailable right now. Please try again.
        </p>
      )}
      {!loading && !error && posts.length === 0 && (
        <div className="py-20 text-sm text-muted">
          No community stories have been published yet.
        </div>
      )}
      {!loading && !error && posts.length > 0 && (
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {posts.map((post) => (
            <article key={post.id} className="border border-foreground/10 bg-surface p-6">
              {post.imageUrl && (
                <img
                  src={post.imageUrl}
                  alt=""
                  className="mb-6 aspect-[16/9] w-full object-cover"
                />
              )}
              <p className="text-xs uppercase tracking-[0.16em] text-muted">
                {post.artist.displayName}
              </p>
              <h2 className="mt-2 font-display text-2xl text-foreground">{post.title}</h2>
              <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted">{post.body}</p>
              <div className="mt-6 flex gap-4 text-sm">
                <Link
                  href={`/artists/${post.artist.slug}`}
                  className="text-accent underline underline-offset-4"
                >
                  View artist
                </Link>
                {post.artwork && (
                  <Link
                    href={`/artwork/${post.artwork.slug}`}
                    className="text-accent underline underline-offset-4"
                  >
                    View artwork
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
