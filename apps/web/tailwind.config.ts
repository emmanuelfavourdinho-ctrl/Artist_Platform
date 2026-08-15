import type { Config } from 'tailwindcss';

/*
  Explainer: this file teaches Tailwind the names of our design tokens
  (defined as CSS variables in app/globals.css) so we can write classes
  like `bg-background` or `text-accent` instead of typing raw color codes
  all over the codebase. If we ever rebrand, we change the CSS variables
  in one place and every component updates automatically.
*/
const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--background) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-raised': 'rgb(var(--surface-raised) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-foreground': 'rgb(var(--accent-foreground) / <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      transitionTimingFunction: {
        cinematic: 'var(--ease-cinematic)',
      },
      maxWidth: {
        content: '84rem',
      },
      spacing: {
        gutter: 'var(--container-gutter)',
      },
      animation: {
        'reveal-up':
          'reveal-up var(--duration-reveal) var(--ease-cinematic) var(--reveal-delay, 0ms) both',
        'scroll-bob': 'scroll-bob 2.2s ease-in-out infinite',
        drift: `drift 12s var(--ease-cinematic) infinite alternate`,
      },
    },
  },
  plugins: [],
};

export default config;
