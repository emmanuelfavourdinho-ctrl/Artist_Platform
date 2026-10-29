'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { StudioShell } from '../../../components/studio/StudioShell';
import { fetchMyProfile, updateMyProfile, type ProfileData } from '../../../lib/userApi';

function SettingsContent() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const data = await fetchMyProfile();
      setProfile(data);
      setFirstName(data.firstName);
      setLastName(data.lastName);
      setPhone(data.phone ?? '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load account settings.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const updated = await updateMyProfile({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() || null });
      setProfile(updated);
      setFeedback('Account details saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Account details could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <StudioShell>
      <header className="border-b border-border/10 pb-6">
        <p className="text-xs uppercase tracking-[.18em] text-accent">Account</p>
        <h1 className="mt-2 font-display text-4xl">Settings</h1>
        <p className="mt-2 text-sm text-muted">Manage the personal details supported by your account.</p>
      </header>
      {error && <p role="alert" className="mt-5 text-sm text-red-300">{error}</p>}
      {feedback && <p role="status" className="mt-5 text-sm text-emerald-400">{feedback}</p>}
      {loading ? <div role="status" aria-label="Loading settings" className="mt-6 h-40 animate-pulse rounded-lg bg-surface" /> : profile && (
        <form onSubmit={(event) => void save(event)} className="mt-6 max-w-xl space-y-4">
          <label className="block text-sm">First name
            <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-1 min-h-11 w-full rounded border border-border/15 bg-surface px-3" />
          </label>
          <label className="block text-sm">Last name
            <input required value={lastName} onChange={(event) => setLastName(event.target.value)} className="mt-1 min-h-11 w-full rounded border border-border/15 bg-surface px-3" />
          </label>
          <label className="block text-sm">Phone
            <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 min-h-11 w-full rounded border border-border/15 bg-surface px-3" />
          </label>
          <label className="block text-sm">Account email
            <input type="email" value={profile.email} readOnly className="mt-1 min-h-11 w-full rounded border border-border/10 bg-surface/60 px-3 text-muted" />
            <span className="mt-1 block text-xs text-muted">Email changes are managed by your sign-in provider.</span>
          </label>
          <button type="submit" disabled={busy} className="min-h-11 rounded bg-accent px-5 text-sm font-medium text-background disabled:opacity-50">{busy ? 'Saving…' : 'Save account details'}</button>
        </form>
      )}
    </StudioShell>
  );
}

export default function StudioSettingsPage() {
  return <ProtectedRoute allowRoles={['ARTIST']}><SettingsContent /></ProtectedRoute>;
}
