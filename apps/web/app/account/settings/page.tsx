'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { useAuth } from '../../../context/AuthContext';

function SettingsContent() {
  const { signOut } = useAuth();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openConfirm() {
    setError(null);
    dialogRef.current?.showModal();
  }

  async function confirmSignOut() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signOut();
      dialogRef.current?.close();
      router.replace('/login' as Route);
    } catch {
      setError('Could not sign you out. Please try again.');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-gutter py-8 sm:py-10">
      <h1 className="font-display text-3xl text-foreground sm:text-4xl">Settings</h1>
      <p className="mt-2 text-sm text-muted">Manage your account and session.</p>

      <section aria-labelledby="account-heading" className="mt-8">
        <h2 id="account-heading" className="font-display text-xl text-foreground">
          Account
        </h2>
        <Link
          href="/account/profile"
          className="mt-3 block rounded-xl border border-border/10 bg-surface p-5 transition hover:border-accent"
        >
          <span className="block text-sm font-medium text-foreground">Profile and security</span>
          <span className="mt-1 block text-sm text-muted">
            Update your account details and sign-in security.
          </span>
        </Link>
      </section>

      <section aria-labelledby="session-heading" className="mt-10">
        <h2 id="session-heading" className="font-display text-xl text-foreground">
          Session
        </h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/10 bg-surface p-5">
          <div>
            <p className="text-sm font-medium text-foreground">Sign out</p>
            <p className="mt-1 text-sm text-muted">End your session on this device.</p>
          </div>
          <button
            type="button"
            onClick={openConfirm}
            className="min-h-11 rounded-md border border-border/20 px-4 text-sm font-medium text-foreground hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Sign out
          </button>
        </div>
      </section>

      <dialog
        ref={dialogRef}
        aria-labelledby="signout-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border/20 bg-surface p-6 text-foreground backdrop:bg-black/70"
      >
        <h2 id="signout-title" className="font-display text-xl">
          Are you sure you want to sign out?
        </h2>
        <p className="mt-2 text-sm text-muted">
          You will need to sign in again to see your orders, saved art, and messages.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={() => dialogRef.current?.close()}
            className="min-h-11 rounded-md border border-border/20 px-4 text-sm hover:border-accent disabled:opacity-50"
          >
            Stay signed in
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmSignOut()}
            className="min-h-11 rounded-md bg-[#e5484d] px-4 text-sm font-semibold text-white hover:bg-[#f05a60] disabled:opacity-50"
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </dialog>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}
