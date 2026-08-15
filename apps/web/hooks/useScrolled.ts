'use client';

import { useEffect, useState } from 'react';

/**
 * Explainer: this hook is a lookout standing at the top of the page. It
 * watches how far down you've scrolled and shouts "yes" or "no" to the
 * question "has the user scrolled past `threshold` pixels yet?" The
 * navbar uses that yes/no to decide whether to turn its background solid.
 */
export function useScrolled(threshold = 24): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > threshold);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  return scrolled;
}
