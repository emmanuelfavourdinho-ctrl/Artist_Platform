'use client';

import Link from 'next/link';
import { useAuth } from '../../../context/AuthContext';

export default function AccountStatusPage() {
  const { signOut } = useAuth();

  return (
    <main className="mx-auto flex min-h-screen max-w-content flex-col items-center justify-center px-gutter py-16 text-center">
      <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">
        Account status
      </p>
      <h1 className="mt-3 font-display text-4xl text-foreground">This account is unavailable.</h1>
      <p className="mt-4 max-w-md text-sm leading-6 text-muted">
        Your account cannot access marketplace activity right now. Contact support if you believe
        this is a mistake.
      </p>
      <div className="mt-8 flex gap-5 text-sm">
        <Link href="/" className="font-medium text-accent underline underline-offset-4">
          Return home
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-muted underline underline-offset-4"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
