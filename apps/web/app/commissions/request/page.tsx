'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthField } from '../../../components/auth/AuthField';
import { AuthSubmitButton } from '../../../components/auth/AuthSubmitButton';
import { FormAlert } from '../../../components/auth/FormAlert';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { useAuth } from '../../../context/AuthContext';
import { marketplaceFetch } from '../../../lib/marketplaceApi';
import { fetchArtistBySlug, type ArtistProfileData } from '../../../lib/artistsApi';
import { CoverImage } from '../../../components/ui/CoverImage';
import {
  CloudinaryImageUpload,
  type UploadedCloudinaryImage,
} from '../../../components/ui/CloudinaryImageUpload';

type Step = 1 | 2 | 3;

// Trusted display context for "you are requesting from X" — always
// refetched from the API by slug rather than read from the query
// string directly, since query params are attacker-controllable and
// we don't want to render an unverified name/avatar as if it were fact.
function ArtistContextBanner({ artistSlug }: { artistSlug: string }) {
  const [artist, setArtist] = useState<ArtistProfileData | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchArtistBySlug(artistSlug)
      .then((result) => {
        if (cancelled) return;
        if (!result) setNotFound(true);
        else setArtist(result);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [artistSlug]);

  if (notFound) return null;
  if (!artist) {
    return <div className="mt-8 h-14 w-64 animate-pulse rounded-lg bg-surface" />;
  }

  return (
    <div className="mt-8 flex items-center gap-3 rounded-lg border border-border/10 bg-surface px-4 py-3">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-raised">
        {artist.profileImageUrl ? (
          <CoverImage
            src={artist.profileImageUrl}
            alt={artist.name}
            sizes="40px"
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted">
            {artist.name.charAt(0)}
          </div>
        )}
      </div>
      <p className="text-sm text-foreground">
        You are requesting a commission from{' '}
        <span className="font-medium text-accent">{artist.name}</span>
      </p>
    </div>
  );
}

function RequestContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [budget, setBudget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [references, setReferences] = useState<UploadedCloudinaryImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const artistId = params.get('artistId') ?? '';
  const artistSlug = params.get('artistSlug') ?? '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!firebaseUser || !artistId) {
      setError('Choose an artist before sending a commission request.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await marketplaceFetch(firebaseUser, '/commissions', {
        method: 'POST',
        body: JSON.stringify({
          artistId,
          title,
          description,
          category: category || undefined,
          budget: budget ? Number(budget) : undefined,
          deadline: deadline || undefined,
          references: references.map((reference) => ({
            ...reference,
            fileType: `image/${reference.format}`,
            fileSize: reference.bytes,
          })),
        }),
      });
      if (!response.ok) throw new Error('We could not send this request. Please try again.');
      router.push('/account');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-content px-gutter py-16 sm:py-24">
      <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">
        Commission request
      </p>
      <h1 className="mt-3 font-display text-5xl text-foreground">Describe the work you want.</h1>
      {artistSlug ? (
        <ArtistContextBanner artistSlug={artistSlug} />
      ) : (
        !artistId && (
          <div className="mt-8 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
            No artist selected. Please start a commission request from an artist&apos;s profile.
          </div>
        )
      )}
      <div className="mt-8 flex gap-3 text-xs uppercase tracking-[0.14em] text-muted">
        {[
          ['1', 'Idea'],
          ['2', 'Details'],
          ['3', 'Review'],
        ].map(([number, label]) => (
          <span key={number} className={step === Number(number) ? 'text-accent' : undefined}>
            {number} {label}
          </span>
        ))}
      </div>
      <form onSubmit={submit} className="mt-12 max-w-2xl space-y-6" noValidate>
        {error && <FormAlert message={error} />}
        {step === 1 && (
          <>
            <AuthField
              id="title"
              label="Project title"
              type="text"
              name="title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <AuthField
              id="category"
              label="Artwork type or category"
              type="text"
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </>
        )}
        {step === 2 && (
          <>
            <div>
              <label htmlFor="description" className="text-sm text-foreground">
                What would you like created?
              </label>
              <textarea
                id="description"
                required
                minLength={20}
                rows={8}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-2 w-full rounded-lg border border-border/20 bg-transparent px-4 py-3 text-sm text-foreground outline-none focus:border-accent"
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <AuthField
                id="budget"
                label="Budget (optional)"
                type="number"
                name="budget"
                min="1"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
              />
              <AuthField
                id="deadline"
                label="Preferred deadline (optional)"
                type="date"
                name="deadline"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </div>
          </>
        )}
        {step === 3 && (
          <div className="space-y-6">
            <CloudinaryImageUpload
              value={references}
              onChange={setReferences}
              signaturePath="/v1/media/commissions/signature"
            />
            <div className="space-y-4 border border-border/10 p-6 text-sm text-muted">
              <p>
                <strong className="text-foreground">Project:</strong> {title}
              </p>
              <p>
                <strong className="text-foreground">Category:</strong> {category || 'Not specified'}
              </p>
              <p>
                <strong className="text-foreground">Brief:</strong> {description}
              </p>
              <p>
                <strong className="text-foreground">Budget:</strong> {budget || 'Not specified'}
              </p>
              <p>
                <strong className="text-foreground">Deadline:</strong> {deadline || 'Not specified'}
              </p>
            </div>
          </div>
        )}
        <div className="flex gap-4 pt-2">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((step - 1) as Step)}
              className="border border-border/20 px-5 py-3 text-sm text-foreground"
            >
              Back
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((step + 1) as Step)}
              className="bg-accent px-5 py-3 text-sm text-accent-foreground"
            >
              Continue
            </button>
          ) : (
            <AuthSubmitButton
              submitting={submitting}
              label="Send commission request"
              submittingLabel="Sending…"
            />
          )}
        </div>
      </form>
    </main>
  );
}

export default function CommissionRequestPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <RequestContent />
      </Suspense>
    </ProtectedRoute>
  );
}
