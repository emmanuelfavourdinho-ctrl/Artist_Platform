'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { useAuth } from '../../../context/AuthContext';
import { fetchMyProfile, updateMyProfile, type ProfileData } from '../../../lib/userApi';
import { sendResetEmail } from '../../../lib/authClient';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type PasswordState = 'idle' | 'sending' | 'sent' | 'error';

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    PENDING_VERIFICATION: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    SUSPENDED: 'bg-red-500/10 text-red-600 border-red-500/20',
    DEACTIVATED: 'bg-foreground/10 text-muted border-foreground/20',
  };
  const label: Record<string, string> = {
    ACTIVE: 'Active',
    PENDING_VERIFICATION: 'Pending verification',
    SUSPENDED: 'Suspended',
    DEACTIVATED: 'Deactivated',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
        styles[status] ?? styles.DEACTIVATED
      }`}
    >
      {label[status] ?? status}
    </span>
  );
}

function ProfileContent() {
  const { refresh, signOut } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const [passwordState, setPasswordState] = useState<PasswordState>('idle');

  useEffect(() => {
    let cancelled = false;
    fetchMyProfile()
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setFirstName(data.firstName);
        setLastName(data.lastName);
        setPhone(data.phone ?? '');
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState('saving');
    setSaveError(null);
    try {
      const updated = await updateMyProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() === '' ? null : phone.trim(),
      });
      setProfile(updated);
      setSaveState('saved');
      // Keeps the shared AuthContext (used in the header greeting,
      // resolveAuthDestination, etc.) in sync with what was just saved —
      // without this, the account page's "Welcome, {firstName}" would
      // keep showing the OLD name until the next full page load.
      await refresh();
      setTimeout(() => setSaveState('idle'), 2500);
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function handlePasswordReset() {
    if (!profile) return;
    setPasswordState('sending');
    try {
      await sendResetEmail(profile.email);
      setPasswordState('sent');
    } catch {
      setPasswordState('error');
    }
  }

  if (loadFailed) {
    return (
      <main className="mx-auto max-w-content px-gutter py-24 text-center">
        <p className="text-sm text-muted">We couldn&apos;t load your profile right now.</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto max-w-content px-gutter py-16 sm:py-24" aria-busy="true">
        <div className="h-8 w-48 animate-pulse rounded bg-foreground/10" />
        <div className="mt-10 h-64 animate-pulse rounded-lg bg-foreground/5" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-content px-gutter py-16 sm:py-24">
      <div className="border-b border-border/10 pb-8">
        <Link href="/account" className="text-sm text-accent underline underline-offset-2">
          ← Back to account
        </Link>
        <p className="mt-4 text-[13px] font-medium uppercase tracking-[0.3em] text-accent">
          Profile
        </p>
        <h1 className="mt-3 font-display text-4xl text-foreground">Your information</h1>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-3">
        {/* Personal information — real, editable, real save */}
        <section className="lg:col-span-2">
          <h2 className="font-display text-xl text-foreground">Personal information</h2>
          <form onSubmit={handleSave} className="mt-6 flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="firstName"
                  className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
                >
                  First name
                </label>
                <input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="mt-2 block w-full rounded-md border border-foreground/15 bg-surface px-4 py-3 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="lastName"
                  className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
                >
                  Last name
                </label>
                <input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="mt-2 block w-full rounded-md border border-foreground/15 bg-surface px-4 py-3 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
              >
                Phone <span className="normal-case text-muted/70">(optional)</span>
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Not set"
                className="mt-2 block w-full rounded-md border border-foreground/15 bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Email
              </label>
              <div className="mt-2 rounded-md border border-foreground/10 bg-foreground/5 px-4 py-3 text-sm text-muted">
                {profile.email}
              </div>
              <p className="mt-1.5 text-xs text-muted">
                Your email is tied to your sign-in method and can&apos;t be changed here yet.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={saveState === 'saving'}
                className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-background transition disabled:opacity-60"
              >
                {saveState === 'saving' ? 'Saving…' : 'Save changes'}
              </button>
              <div role="status" aria-live="polite" className="text-sm">
                {saveState === 'saved' && <span className="text-emerald-600">Saved.</span>}
                {saveState === 'error' && <span className="text-red-500">{saveError}</span>}
              </div>
            </div>
          </form>
        </section>

        {/* Security + account status — real actions, real data */}
        <aside className="flex flex-col gap-6">
          <div className="rounded-lg border border-border/10 p-6">
            <h2 className="font-display text-lg text-foreground">Security</h2>
            <p className="mt-2 text-sm text-muted">
              Reset your password by email — the same secure flow as &quot;Forgot password.&quot;
            </p>
            <button
              type="button"
              onClick={() => void handlePasswordReset()}
              disabled={passwordState === 'sending'}
              className="mt-4 text-sm font-medium text-accent underline underline-offset-2 disabled:opacity-60"
            >
              {passwordState === 'sending' ? 'Sending…' : 'Send password reset email'}
            </button>
            <div role="status" aria-live="polite" className="mt-2 text-xs">
              {passwordState === 'sent' && (
                <span className="text-emerald-600">Check your inbox for a reset link.</span>
              )}
              {passwordState === 'error' && (
                <span className="text-red-500">Couldn&apos;t send the email. Try again.</span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border/10 p-6">
            <h2 className="font-display text-lg text-foreground">Account</h2>
            <div className="mt-3">
              <StatusBadge status={profile.status} />
            </div>
            {profile.roles && (
              <p className="mt-3 text-xs uppercase tracking-wide text-muted">
                {profile.roles.join(' · ')}
              </p>
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-5 text-sm font-medium text-accent underline underline-offset-2"
            >
              Sign out
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileContent />
    </ProtectedRoute>
  );
}
