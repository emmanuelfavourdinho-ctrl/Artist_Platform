'use client';

import Image from 'next/image';
import { useState } from 'react';

import { cloudinaryLoader } from '../../lib/cloudinaryLoader';

/*
    Explainer: this is the one place in the whole codebase that knows how
    to show a photo. Every artist portrait, artwork photo, category tile,
    and hero background all go through this same component. Three jobs:

    1. LAZY LOADING — below-the-fold photos (artists, artworks, categories)
        don't download at all until the browser is about to scroll them
        into view. The very first hero photo is the one exception (see
        `priority` below), because that one needs to appear immediately.

    2. FEELS INSTANT REGARDLESS OF NETWORK SPEED — the space an image will
        occupy is reserved up front by the parent's aspect-ratio class (so
        nothing jumps around as photos arrive), and a soft "shimmer" panel
        sits in that space while the real photo is still downloading. The
        photo then fades in over half a second once it's ready. On a fast
        connection this all happens so quickly you won't even notice the
        shimmer; on a slow connection, the page still looks calm and
        intentional instead of full of gray boxes popping in at random.

    3. GRACEFUL FALLBACK — if a photo file hasn't been added yet (see the
        README files in each public/images folder), this shows a plain
        "Image coming soon" panel instead of a broken-image icon.

    4. CLOUDINARY-AWARE — if `src` is a Cloudinary delivery URL (real
        artwork/artist photos come from there), width/format/quality
        transforms are handled by Cloudinary's own CDN via a per-image
        loader, instead of Next's built-in image optimizer. Local /public
        images (like the hero photos) are untouched and still go through
        Next's normal optimizer, exactly as before.
    */

type CoverImageProps = {
  src: string;
  alt: string;
  /**
   * Only ever set this true for the single image that's visible the
   * moment the page loads (the first hero slide). It tells the browser
   * to fetch that one photo immediately, at high priority, instead of
   * lazily — because for that specific photo, "lazy" would mean the
   * user stares at empty space for something they can already see.
   */
  priority?: boolean;
  className?: string;
  sizes?: string;
};

export function CoverImage({ src, alt, priority = false, className = '', sizes }: CoverImageProps) {
  // `status` tracks where this specific photo is in its lifecycle. We
  // start in 'loading', and the browser tells us (via onLoad/onError)
  // which of the other two states to move to.
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');

  const isCloudinary = src.includes('res.cloudinary.com');

  if (status === 'failed') {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-surface ${className}`}
        role={alt ? 'img' : 'presentation'}
        aria-label={alt || undefined}
      >
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted">
          Image coming soon
        </span>
      </div>
    );
  }

  return (
    // This wrapper is what next/image's `fill` mode measures itself
    // against — "relative" makes it the positioning anchor, and
    // "overflow-hidden" clips the photo to this box's rounded corners.
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      {/*
            The shimmer skeleton. It sits behind the photo and fades out
            (opacity 0) the instant the photo finishes loading. `aria-hidden`
            because it's purely decorative — a screen reader shouldn't
            announce it at all.
        */}
      <div
        aria-hidden="true"
        className="absolute inset-0 transition-opacity duration-500 ease-cinematic"
        style={{ opacity: status === 'loaded' ? 0 : 1 }}
      >
        <div className="h-full w-full animate-shimmer bg-gradient-to-r from-surface via-surface-raised to-surface bg-[length:200%_100%]" />
      </div>

      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        loader={isCloudinary ? cloudinaryLoader : undefined}
        // Next.js doesn't allow `priority` and `loading` to be set at
        // the same time (priority already implies "load this now").
        // So: the hero's first slide gets `loading={undefined}` (i.e.
        // not set, because priority handles it); every other image
        // explicitly gets 'lazy'.
        loading={priority ? undefined : 'lazy'}
        sizes={sizes ?? '(min-width: 1024px) 33vw, 100vw'}
        className="object-cover transition-opacity duration-500 ease-cinematic"
        style={{ opacity: status === 'loaded' ? 1 : 0 }}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('failed')}
      />
    </div>
  );
}
