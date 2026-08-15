'use client';

import { useEffect, useState } from 'react';

/**
 * Explainer: some people turn on a system setting that says "please don't
 * animate things at me" (often because motion causes them dizziness or
 * distraction). This hook asks the browser whether that setting is on,
 * so components can turn off big movements and just show content still.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);

    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  return reduced;
}
