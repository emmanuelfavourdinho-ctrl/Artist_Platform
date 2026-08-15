import '@testing-library/jest-dom';

/*
  Explainer: jsdom (the fake browser our tests run in) doesn't implement
  `window.matchMedia`, a real-browser API we use to detect the
  "reduce motion" accessibility setting. Without this stand-in, any test
  that renders a component using that API would crash. This gives it a
  safe default (motion not reduced) so tests can run.
*/
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

/*
  Explainer: same story as matchMedia above — jsdom also doesn't
  implement IntersectionObserver (the "has this scrolled into view yet"
  watcher our <Reveal> component uses). This stand-in does nothing, it
  just stops tests from crashing when a component asks for it.
*/
if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error — a minimal test-only stand-in, not a full implementation
  window.IntersectionObserver = MockIntersectionObserver;
  // @ts-expect-error — some libraries read it off the global scope directly
  globalThis.IntersectionObserver = MockIntersectionObserver;
}
