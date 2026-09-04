'use client';

import Link from 'next/link';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { useAuth } from '../../context/AuthContext';

function AccountContent() {
  const { appUser, signOut } = useAuth();

  if (!appUser) return null;

  return (
    <main className="mx-auto min-h-screen max-w-content px-gutter py-16 sm:py-24">
      <div className="flex flex-col gap-6 border-b border-border/10 pb-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">
            Buyer account
          </p>
          <h1 className="mt-3 font-display text-4xl text-foreground">
            Welcome, {appUser.firstName}.
          </h1>
          <p className="mt-3 text-sm text-muted">{appUser.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="self-start text-sm font-medium text-accent underline underline-offset-4 sm:self-auto"
        >
          Sign out
        </button>
      </div>

      <section
        className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Account areas"
      >
        <Link
          href="/orders"
          className="rounded-lg border border-border/10 p-6 transition hover:border-accent"
        >
          <h2 className="font-display text-xl text-foreground">Orders</h2>
          <p className="mt-2 text-sm text-muted">Track purchases and delivery activity.</p>
        </Link>
        <Link
          href="/favorites"
          className="rounded-lg border border-border/10 p-6 transition hover:border-accent"
        >
          <h2 className="font-display text-xl text-foreground">Favorites</h2>
          <p className="mt-2 text-sm text-muted">Return to artwork you have saved.</p>
        </Link>
        <Link
          href="/gallery"
          className="rounded-lg border border-border/10 p-6 transition hover:border-accent"
        >
          <h2 className="font-display text-xl text-foreground">Discover</h2>
          <p className="mt-2 text-sm text-muted">Explore artists and original work.</p>
        </Link>
        <div className="rounded-lg border border-border/10 p-6">
          <h2 className="font-display text-xl text-foreground">Profile</h2>
          <p className="mt-2 text-sm text-muted">Your marketplace identity is active.</p>
        </div>
      </section>
    </main>
  );
}

export default function AccountPage() {
  return (
    <ProtectedRoute>
      <AccountContent />
    </ProtectedRoute>
  );
}
