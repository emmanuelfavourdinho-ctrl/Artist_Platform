'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { StudioShell } from '../../../components/studio/StudioShell';
import { CloudinaryImageUpload, type UploadedCloudinaryImage } from '../../../components/ui/CloudinaryImageUpload';
import { CoverImage } from '../../../components/ui/CoverImage';
import { fetchStudioArtistProfile, updateStudioArtistProfile, type ArtistProfileView } from '../../../lib/studioApi';

type FieldErrors = Partial<Record<'displayName' | 'biography' | 'website', string>>;

function ProfileContent() {
  const [profile, setProfile] = useState<ArtistProfileView | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [biography, setBiography] = useState('');
  const [artisticStatement, setArtisticStatement] = useState('');
  const [mission, setMission] = useState('');
  const [website, setWebsite] = useState('');
  const [location, setLocation] = useState('');
  const [profileUpload, setProfileUpload] = useState<UploadedCloudinaryImage[]>([]);
  const [coverUpload, setCoverUpload] = useState<UploadedCloudinaryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [profileUploadBusy, setProfileUploadBusy] = useState(false);
  const [coverUploadBusy, setCoverUploadBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState('');

  const applyProfile = (next: ArtistProfileView) => {
    setProfile(next);
    setDisplayName(next.displayName);
    setBiography(next.biography ?? '');
    setArtisticStatement(next.artisticStatement ?? '');
    setMission(next.mission ?? '');
    setWebsite(next.website ?? '');
    setLocation(next.location ?? '');
  };

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      applyProfile(await fetchStudioArtistProfile());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your artist profile.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: FieldErrors = {};
    if (displayName.trim().length < 2) nextErrors.displayName = 'Use at least 2 characters for your public name.';
    if (biography.trim().length < 20) nextErrors.biography = 'Add at least 20 characters to your biography.';
    if (website.trim()) {
      try { new URL(website); } catch { nextErrors.website = 'Enter a complete website address, including https://.'; }
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const updated = await updateStudioArtistProfile({
        displayName: displayName.trim(),
        biography: biography.trim(),
        artisticStatement: artisticStatement.trim(),
        mission: mission.trim(),
        website: website.trim(),
        location: location.trim(),
        ...(profileUpload[0] ? { profileImage: profileUpload[0] } : {}),
        ...(coverUpload[0] ? { coverImage: coverUpload[0] } : {}),
      });
      applyProfile(updated);
      setProfileUpload([]);
      setCoverUpload([]);
      setFeedback('Your public artist profile has been saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Your profile could not be saved. Your changes are still here.');
    } finally {
      setBusy(false);
    }
  }

  const publicHref = profile ? `/artists/${profile.slug}` as Route : '/studio/profile';
  const profilePreview = profileUpload[0]?.secureUrl ?? profile?.profileImageUrl ?? null;
  const coverPreview = coverUpload[0]?.secureUrl ?? profile?.coverImageUrl ?? null;
  const uploadBusy = profileUploadBusy || coverUploadBusy;

  return (
    <StudioShell>
      <header className="border-b border-border/10 pb-6">
        <p className="text-xs uppercase tracking-[.18em] text-accent">Your storefront</p>
        <h1 className="mt-2 font-display text-4xl">Artist Profile</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">Shape the public portfolio buyers see when you share your Fine Arts link.</p>
      </header>
      {error && <p role="alert" className="mt-5 rounded border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">{error}</p>}
      {feedback && <p role="status" className="mt-5 text-sm text-emerald-400">{feedback}</p>}
      {loading ? <div role="status" aria-label="Loading profile" className="mt-6 h-40 animate-pulse rounded-lg bg-surface" /> : profile && (
        <div className="mt-7 grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
          <form onSubmit={(event) => void save(event)} className="space-y-6" noValidate>
            <section className="space-y-4 rounded-lg border border-border/10 bg-surface p-4 sm:p-6">
              <h2 className="font-display text-xl">Your story</h2>
              <label className="block text-sm">Public artist name
                <input required minLength={2} maxLength={100} value={displayName} aria-invalid={!!fieldErrors.displayName} aria-describedby={fieldErrors.displayName ? 'display-name-error' : undefined} onChange={(event) => setDisplayName(event.target.value)} className="mt-1 min-h-11 w-full rounded border border-border/15 bg-background px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
                {fieldErrors.displayName && <span id="display-name-error" className="mt-1 block text-xs text-red-300">{fieldErrors.displayName}</span>}
              </label>
              <label className="block text-sm">Biography
                <textarea required minLength={20} maxLength={2000} rows={6} value={biography} aria-invalid={!!fieldErrors.biography} aria-describedby={fieldErrors.biography ? 'biography-error' : undefined} onChange={(event) => setBiography(event.target.value)} className="mt-1 w-full rounded border border-border/15 bg-background px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
                {fieldErrors.biography && <span id="biography-error" className="mt-1 block text-xs text-red-300">{fieldErrors.biography}</span>}
              </label>
              <label className="block text-sm">Artist statement <span className="text-muted">(optional)</span>
                <textarea maxLength={2000} rows={4} value={artisticStatement} onChange={(event) => setArtisticStatement(event.target.value)} className="mt-1 w-full rounded border border-border/15 bg-background px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
              </label>
              <label className="block text-sm">What guides your work? <span className="text-muted">(optional)</span>
                <textarea maxLength={2000} rows={3} value={mission} onChange={(event) => setMission(event.target.value)} className="mt-1 w-full rounded border border-border/15 bg-background px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">Location <span className="text-muted">(optional)</span>
                  <input maxLength={120} value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1 min-h-11 w-full rounded border border-border/15 bg-background px-3" />
                </label>
                <label className="block text-sm">Website <span className="text-muted">(optional)</span>
                  <input type="url" maxLength={500} value={website} aria-invalid={!!fieldErrors.website} aria-describedby={fieldErrors.website ? 'website-error' : undefined} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.com" className="mt-1 min-h-11 w-full rounded border border-border/15 bg-background px-3" />
                  {fieldErrors.website && <span id="website-error" className="mt-1 block text-xs text-red-300">{fieldErrors.website}</span>}
                </label>
              </div>
            </section>

            <section className="space-y-5 rounded-lg border border-border/10 bg-surface p-4 sm:p-6">
              <div><h2 className="font-display text-xl">Portfolio images</h2><p className="mt-1 text-sm text-muted">Images upload directly to your private artist Cloudinary folders. They replace the current image only after you save this profile.</p></div>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Profile picture</p>
                  <div className="relative h-28 w-28 overflow-hidden rounded-full border border-border/15 bg-background">
                    {profilePreview ? <CoverImage src={profilePreview} alt="Profile picture preview" sizes="112px" /> : <div className="flex h-full items-center justify-center text-3xl text-muted">{displayName.charAt(0) || '?'}</div>}
                  </div>
                  <CloudinaryImageUpload value={profileUpload} onChange={setProfileUpload} onUploadStatusChange={setProfileUploadBusy} maxImages={1} label="Choose profile picture" description="JPG, PNG, or WEBP · up to 10 MB" maxFileSize={10 * 1024 * 1024} acceptedTypes={['image/jpeg', 'image/png', 'image/webp']} signaturePath="/v1/studio/uploads/cloudinary-signature?purpose=profile" />
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-medium">Cover image</p>
                  <div className="relative aspect-[3/1] w-full overflow-hidden rounded border border-border/15 bg-background">
                    {coverPreview ? <CoverImage src={coverPreview} alt="Cover image preview" sizes="(min-width: 768px) 40vw, 100vw" /> : <div className="flex h-full items-center justify-center text-sm text-muted">Add a portfolio banner</div>}
                  </div>
                  <CloudinaryImageUpload value={coverUpload} onChange={setCoverUpload} onUploadStatusChange={setCoverUploadBusy} maxImages={1} label="Choose cover image" description="JPG, PNG, or WEBP · up to 10 MB" maxFileSize={10 * 1024 * 1024} acceptedTypes={['image/jpeg', 'image/png', 'image/webp']} signaturePath="/v1/studio/uploads/cloudinary-signature?purpose=cover" />
                </div>
              </div>
            </section>
            <button type="submit" disabled={busy || uploadBusy || loading} className="min-h-11 w-full rounded bg-accent px-5 text-sm font-medium text-background disabled:opacity-50 sm:w-auto">{busy ? 'Saving profile…' : uploadBusy ? 'Image upload in progress…' : 'Save profile'}</button>
          </form>

          <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Public portfolio preview</p>
              <h2 className="mt-1 font-display text-2xl">Preview before you share</h2>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/10 bg-surface">
              <div className="relative aspect-[3/1] bg-background">
                {coverPreview && <CoverImage src={coverPreview} alt="" sizes="(min-width: 1280px) 35vw, 100vw" />}
              </div>
              <div className="px-4 pb-5">
                <div className="-mt-9 flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-full border-4 border-surface bg-background font-display text-2xl">
                  {profilePreview ? <CoverImage src={profilePreview} alt={`${displayName || 'Artist'} profile preview`} sizes="72px" /> : displayName.charAt(0) || '?'}
                </div>
                <h3 className="mt-3 font-display text-2xl">{displayName || 'Your artist name'}</h3>
                {location && <p className="mt-1 text-xs text-muted">{location}</p>}
                <p className="mt-3 line-clamp-5 text-sm leading-6 text-foreground/75">{biography || 'Your biography will appear here.'}</p>
                {artisticStatement && <p className="mt-3 border-l border-accent/60 pl-3 text-sm italic text-muted">{artisticStatement}</p>}
              </div>
            </div>
            <div className="rounded-lg border border-border/10 p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Stable public link</p>
              <p className="mt-2 break-all text-sm">/artists/{profile.slug}</p>
              <Link href={publicHref} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center rounded border border-accent/40 px-4 text-sm text-accent hover:bg-accent/10">Preview public profile ↗</Link>
              <p className="mt-3 text-xs text-muted">Your profile slug stays the same when you update these details, so links you have already shared keep working.</p>
            </div>
          </aside>
        </div>
      )}
    </StudioShell>
  );
}

export default function StudioProfilePage() {
  return <ProtectedRoute allowRoles={['ARTIST']}><ProfileContent /></ProtectedRoute>;
}
