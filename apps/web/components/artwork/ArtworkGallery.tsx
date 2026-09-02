'use client';

import { useState } from 'react';

import { CoverImage } from '../ui/CoverImage';
import type { ArtworkDetailImage } from '../../lib/artworksApi';

export function ArtworkGallery({ images, title }: { images: ArtworkDetailImage[]; title: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = images[activeIndex];

  return (
    <div>
      <div className="aspect-[4/5] overflow-hidden rounded-md bg-surface">
        {activeImage ? (
          <CoverImage
            src={activeImage.url}
            alt={activeImage.altText ?? title}
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted">
              Image coming soon
            </span>
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-4 flex gap-3">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`View image ${index + 1} of ${images.length}`}
              aria-current={index === activeIndex}
              className={`h-20 w-20 overflow-hidden rounded-md border transition-colors duration-200 ${
                index === activeIndex
                  ? 'border-accent'
                  : 'border-transparent hover:border-foreground/30'
              }`}
            >
              <CoverImage src={image.url} alt="" sizes="80px" className="h-full w-full" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
