'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Explainer: a "watcher" (IntersectionObserver) sits and waits until an
 * element scrolls into the visible part of the screen. The first time
 * that happens, we flip a switch to true and stop watching — that switch
 * is what a section uses to trigger its gentle fade/slide-up entrance.
 * We only ever reveal once, so scrolling up and down doesn't re-trigger
 * the animation over and over.
 */
export function useRevealOnScroll<T extends HTMLElement>(): {
  ref: React.RefObject<T>;
  visible: boolean;
} {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref: ref as React.RefObject<T>, visible };
}
