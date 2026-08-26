import type { ReactNode } from 'react';

import { CoverImage } from '../ui/CoverImage';

interface AuthLayoutProps {
  image: string;
  quote: string;
  children: ReactNode;
}

/*
  Explainer: every auth page (login, register, and later forgot/reset
  password) shares this same shell — a full-height photo with a quote on
  the left (desktop only, hidden on mobile to keep the form front and
  center on small screens), the actual form on the right. One shared
  layout means every auth page stays visually consistent automatically,
  and swapping the brand photo happens once here instead of per-page.
*/
export function AuthLayout({ image, quote, children }: AuthLayoutProps) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <CoverImage src={image} alt="" priority sizes="50vw" className="h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/10" />
        <div className="absolute inset-0 flex flex-col justify-between p-12">
          <a href="/" className="font-display text-lg tracking-[0.08em] text-foreground">
            ARTIST<span className="text-accent">_</span>PLATFORM
          </a>
          <p className="max-w-md font-display text-3xl italic leading-snug text-foreground">
            {quote}
          </p>
        </div>
      </div>

      <div className="flex flex-col justify-center bg-background px-gutter py-16 sm:px-16 lg:px-20">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </div>
    </main>
  );
}
