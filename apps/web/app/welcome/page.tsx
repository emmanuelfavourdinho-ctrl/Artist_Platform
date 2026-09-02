'use client';

import Link from 'next/link';
import { Reveal } from '../../components/ui/Reveal';

export default function WelcomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-content flex-col items-center justify-center px-gutter py-16 text-center">
      <Reveal>
        <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">Welcome</p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] text-foreground">
          What brings you to the <span className="italic text-accent">FineArts?</span>
        </h1>
      </Reveal>

      <Reveal delay={120}>
        <div className="mt-12 grid w-full max-w-xl gap-4 sm:grid-cols-2">
          <Link
            href="/register?intent=artist"
            className="rounded-lg border border-foreground/10 p-8 text-left transition hover:border-accent"
          >
            <span className="font-display text-xl text-foreground">I&apos;m an Artist</span>
            <p className="mt-2 text-sm text-muted">Showcase and sell your artwork.</p>
          </Link>

          <Link
            href="/register?intent=buyer"
            className="rounded-lg border border-foreground/10 p-8 text-left transition hover:border-accent"
          >
            <span className="font-display text-xl text-foreground">I want to Buy Art</span>
            <p className="mt-2 text-sm text-muted">Discover and purchase original artwork.</p>
          </Link>
        </div>
      </Reveal>

      <Reveal delay={200}>
        <p className="mt-10 text-sm text-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent underline underline-offset-2">
            Log in
          </Link>
        </p>
      </Reveal>
    </main>
  );
}
