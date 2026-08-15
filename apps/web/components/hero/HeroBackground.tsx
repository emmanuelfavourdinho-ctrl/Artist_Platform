'use client';

import { useEffect, useState } from 'react';

import { CoverImage } from '../ui/CoverImage';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const SLIDES: { src: string; alt: string }[] = [
  { src: '/images/hero/hero-01.jpg', alt: 'A painter at work in her studio' },
  { src: '/images/hero/hero-02.jpg', alt: 'A sculptor shaping reclaimed marble' },
  { src: '/images/hero/hero-03.jpg', alt: 'A long-exposure photograph of a coastline' },
  { src: '/images/hero/hero-04.jpg', alt: 'A generative digital artwork' },
];

/*
  Explainer: this is a slideshow, but a slow, expensive-feeling one — the
  kind you'd see in a film festival trailer, not a normal website carousel.
  Every 7 seconds we quietly swap which photo is on top. Both the
  outgoing and incoming slide are layered exactly on top of each other, so
  as one fades out and shrinks back to normal size, the other fades in and
  gently zooms — that overlap is what makes it read as a soft crossfade
  instead of a jarring image swap.

  The alt text is empty on the images themselves (they're purely
  decorative background — the real heading text carries the meaning),
  but each slide still has a describable `alt` here in case we want to
  surface it elsewhere later.
*/
export function HeroBackground() {
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return undefined;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % SLIDES.length);
    }, 7000);
    return () => window.clearInterval(interval);
  }, [reducedMotion]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-background">
      {SLIDES.map((slide, index) => {
        const isActive = index === activeIndex;
        return (
          <div
            key={slide.src}
            aria-hidden={!isActive}
            className="absolute inset-0"
            style={{
              opacity: isActive ? 1 : 0,
              transition: reducedMotion
                ? 'opacity 400ms ease'
                : 'opacity 1800ms var(--ease-cinematic)',
            }}
          >
            <div
              className="h-full w-full"
              style={{
                animation:
                  isActive && !reducedMotion
                    ? 'drift 12s var(--ease-cinematic) infinite alternate'
                    : undefined,
              }}
            >
              <CoverImage
                src={slide.src}
                alt={slide.alt}
                priority={index === 0}
                sizes="100vw"
                className="h-full w-full"
              />
            </div>
          </div>
        );
      })}

      {/* Layered overlay: keeps headline text readable without hiding the artwork underneath. */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-background/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-transparent to-background/30" />
    </div>
  );
}
