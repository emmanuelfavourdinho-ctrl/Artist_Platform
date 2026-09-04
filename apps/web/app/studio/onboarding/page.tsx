'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AuthField } from '../../../components/auth/AuthField';
import { AuthSubmitButton } from '../../../components/auth/AuthSubmitButton';
import { FormAlert } from '../../../components/auth/FormAlert';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { useAuth } from '../../../context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

function ArtistOnboardingContent() {
  const router = useRouter();
  const { firebaseUser, artistProfile, refresh } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [biography, setBiography] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (artistProfile?.exists && artistProfile.isComplete) router.replace('/studio');
  }, [artistProfile, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error('Please sign in again.');

      const response = await fetch(`${API_URL}/api/v1/studio/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ displayName, biography, location }),
      });
      if (!response.ok) throw new Error('We could not save your artist profile.');

      await refresh();
      router.replace('/studio');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not save your artist profile.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-content px-gutter py-16 sm:py-24">
      <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">Artist setup</p>
      <h1 className="mt-3 max-w-2xl font-display text-4xl text-foreground">
        Tell collectors what makes your work yours.
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-muted">
        Complete your public artist profile before opening your Studio.
      </p>

      <form onSubmit={handleSubmit} className="mt-10 max-w-xl space-y-5" noValidate>
        {error && <FormAlert message={error} />}
        <AuthField
          id="displayName"
          label="Display name"
          type="text"
          name="displayName"
          required
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <div>
          <label htmlFor="biography" className="text-sm text-foreground">
            Biography
          </label>
          <textarea
            id="biography"
            name="biography"
            required
            minLength={20}
            rows={6}
            value={biography}
            onChange={(event) => setBiography(event.target.value)}
            className="mt-2 w-full rounded-lg border border-border/20 bg-transparent px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent"
          />
        </div>
        <AuthField
          id="location"
          label="Location"
          type="text"
          name="location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
        <AuthSubmitButton
          submitting={submitting}
          label="Complete artist profile"
          submittingLabel="Saving profile…"
        />
      </form>
    </main>
  );
}

export default function ArtistOnboardingPage() {
  return (
    <ProtectedRoute allowRoles={['ARTIST']}>
      <ArtistOnboardingContent />
    </ProtectedRoute>
  );
}
