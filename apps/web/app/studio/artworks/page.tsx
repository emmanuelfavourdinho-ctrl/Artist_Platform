'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { CloudinaryImageUpload, type UploadedCloudinaryImage } from '../../../components/ui/CloudinaryImageUpload';
import { StudioShell } from '../../../components/studio/StudioShell';
import {
  archiveStudioArtwork,
  createStudioArtwork,
  fetchStudioArtworks,
  publishStudioArtwork,
  submitStudioArtwork,
  updateStudioArtwork,
  type StudioArtwork,
  type StudioArtworkInput,
} from '../../../lib/studioApi';
import { formatListingPrice } from '../../../lib/listingPricing';

const STATUSES = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED', 'SOLD'] as const;

const STATUS_COPY: Record<StudioArtwork['status'], string> = {
  DRAFT: 'Draft · only visible in your Studio',
  PENDING_REVIEW: 'Under moderation review',
  APPROVED: 'Approved · ready to publish',
  PUBLISHED: 'Published publicly',
  REJECTED: 'Returned for corrections',
  ARCHIVED: 'Archived · not listed publicly',
  SOLD: 'Sold',
};

type WizardDraft = {
  title: string;
  description: string;
  materials: string;
  yearCreated: string;
  width: string;
  height: string;
  depth: string;
  price: string;
  images: UploadedCloudinaryImage[];
};

type ArtworkUpdateInput = Omit<StudioArtworkInput, 'currency' | 'price'> & { price?: string };

const emptyDraft = (): WizardDraft => ({
  title: '', description: '', materials: '', yearCreated: '', width: '', height: '', depth: '', price: '', images: [],
});

function ArtworkWizard({
  initial,
  artwork,
  onClose,
  onSaved,
}: {
  initial: WizardDraft;
  artwork: StudioArtwork | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(0);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const legacyCurrency = artwork && artwork.currency.toUpperCase() !== 'USD';

  const set = <K extends keyof WizardDraft>(key: K, value: WizardDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const payload = (): ArtworkUpdateInput => ({
    title: draft.title.trim(),
    description: draft.description.trim(),
    ...(draft.materials.trim() ? { materials: draft.materials.trim() } : {}),
    ...(draft.yearCreated ? { yearCreated: Number(draft.yearCreated) } : {}),
    ...(draft.width ? { width: draft.width } : {}),
    ...(draft.height ? { height: draft.height } : {}),
    ...(draft.depth ? { depth: draft.depth } : {}),
    ...(!legacyCurrency ? { price: draft.price } : {}),
    images: draft.images,
  });

  async function save(submit: boolean) {
    setBusy(true);
    setError('');
    try {
      let saved = artwork;
      if (createdId) {
        if (submit) await submitStudioArtwork(createdId);
      } else {
        saved = artwork
          ? await updateStudioArtwork(artwork.id, payload())
          : await createStudioArtwork({ ...payload(), price: draft.price, currency: 'USD' });
        if (!artwork && submit) {
          setCreatedId(saved.id);
          await submitStudioArtwork(saved.id);
        } else if (artwork && submit) {
          await submitStudioArtwork(artwork.id);
        }
      }
      onSaved(submit ? 'Artwork submitted for moderation.' : 'Artwork draft saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Artwork could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const stepTitles = ['Artwork details', 'Images', 'Pricing', 'Review & publish'];
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-3 sm:p-6" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="wizard-title" className="mx-auto my-3 max-w-3xl rounded-xl border border-border/15 bg-background p-4 shadow-2xl sm:my-8 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.16em] text-accent">Step {step + 1} of 4</p>
            <h2 id="wizard-title" className="mt-1 font-display text-2xl">{artwork ? 'Edit artwork' : 'Create artwork'}</h2>
          </div>
          <button type="button" onClick={onClose} className="min-h-10 min-w-10 rounded border border-border/15 text-sm" aria-label="Close artwork editor">×</button>
        </div>
        <ol aria-label="Artwork progress" className="mt-5 grid grid-cols-4 gap-1 text-center text-[10px] text-muted sm:text-xs">
          {stepTitles.map((title, index) => <li key={title} className={`border-t-2 py-2 ${index === step ? 'border-accent text-accent' : index < step ? 'border-accent/50' : 'border-border/20'}`}>{title}</li>)}
        </ol>

        {error && <p role="alert" className="mt-4 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

        <form onSubmit={(event: FormEvent) => event.preventDefault()} className="mt-5 space-y-5">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">Artwork title
                <input required minLength={2} maxLength={160} value={draft.title} onChange={(event) => set('title', event.target.value)} className="mt-1 min-h-11 w-full rounded border border-border/20 bg-surface px-3" />
              </label>
              <label className="text-sm sm:col-span-2">Description
                <textarea maxLength={10000} rows={4} value={draft.description} onChange={(event) => set('description', event.target.value)} className="mt-1 w-full rounded border border-border/20 bg-surface px-3 py-2" />
              </label>
              <label className="text-sm sm:col-span-2">Materials
                <input maxLength={500} value={draft.materials} onChange={(event) => set('materials', event.target.value)} className="mt-1 min-h-11 w-full rounded border border-border/20 bg-surface px-3" />
              </label>
              <label className="text-sm">Year created
                <input type="number" min="1000" max={new Date().getFullYear()} value={draft.yearCreated} onChange={(event) => set('yearCreated', event.target.value)} className="mt-1 min-h-11 w-full rounded border border-border/20 bg-surface px-3" />
              </label>
              <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                {(['width', 'height', 'depth'] as const).map((dimension) => (
                  <label key={dimension} className="text-sm capitalize">{dimension} (cm)
                    <input inputMode="decimal" value={draft[dimension]} onChange={(event) => set(dimension, event.target.value)} className="mt-1 min-h-11 w-full rounded border border-border/20 bg-surface px-3" />
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              {artwork && <p className="mb-3 text-xs text-muted">Existing images remain attached to this listing. New images can be added below.</p>}
              <CloudinaryImageUpload value={draft.images} onChange={(images) => set('images', images)} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted">New artwork listings use USD. Exact commission and financial calculations remain on the server.</p>
              <label className="block text-sm">Price (USD)
                <input type="text" inputMode="decimal" pattern="(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?" required={!legacyCurrency} disabled={!!legacyCurrency} value={legacyCurrency ? artwork!.price : draft.price} onChange={(event) => set('price', event.target.value)} className="mt-1 min-h-11 w-full rounded border border-border/20 bg-surface px-3 disabled:opacity-60" />
              </label>
              {legacyCurrency && <p className="text-sm text-amber-300">This existing listing uses {artwork!.currency}. Its currency and price are preserved; use the finance reconciliation workflow before changing its price.</p>}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                <div className="relative aspect-square overflow-hidden rounded bg-surface">
                  {draft.images[0] && <Image src={draft.images[0].secureUrl} alt={draft.images[0].altText || draft.title || 'Artwork preview'} fill sizes="160px" className="object-cover" />}
                  {!draft.images[0] && <div className="flex h-full items-center justify-center text-sm text-muted">No cover image</div>}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">{artwork?.status ?? 'New draft'}</p>
                  <h3 className="mt-1 font-display text-2xl">{draft.title || 'Untitled artwork'}</h3>
                  <p className="mt-2 text-sm text-muted">{draft.description || 'No description added.'}</p>
                  <p className="mt-3 font-mono text-accent">{legacyCurrency ? formatListingPrice(artwork!.price, artwork!.currency) : formatListingPrice(draft.price || '0', 'USD')}</p>
                  <p className="mt-2 text-xs text-muted">Save as a private draft or submit for moderation. Submitted artwork is not published; it stays private until approved and published.</p>
                </div>
              </div>
              {preview && (
                <div className="rounded-lg border border-accent/30 p-4" aria-label="Buyer preview">
                  <p className="text-xs uppercase tracking-wide text-accent">Buyer preview · not published</p>
                  <h4 className="mt-2 font-display text-xl">{draft.title}</h4>
                  <p className="mt-1 text-sm text-muted">{draft.description}</p>
                </div>
              )}
              <button type="button" onClick={() => setPreview((value) => !value)} className="min-h-10 text-sm text-accent underline">{preview ? 'Hide buyer preview' : 'Preview listing'}</button>
            </div>
          )}

          <div className="flex flex-wrap justify-between gap-2 border-t border-border/10 pt-4">
            <button type="button" disabled={step === 0 || busy} onClick={() => setStep((value) => Math.max(0, value - 1))} className="min-h-11 rounded border border-border/20 px-4 text-sm disabled:opacity-40">Back</button>
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              {step < 3 ? (
                <button type="button" disabled={busy || (step === 1 && draft.images.length === 0)} onClick={() => setStep((value) => Math.min(3, value + 1))} className="min-h-11 rounded bg-accent px-5 text-sm font-medium text-background disabled:opacity-50">Continue</button>
              ) : (
                <>
                  <button type="button" disabled={busy || !draft.title.trim() || draft.images.length === 0 || (!legacyCurrency && !draft.price)} onClick={() => void save(false)} className="min-h-11 rounded border border-border/20 px-4 text-sm disabled:opacity-50">{busy ? 'Saving…' : 'Save draft'}</button>
                  {artwork?.status === 'APPROVED' ? (
                    <button type="button" disabled={busy} onClick={() => void publishStudioArtwork(artwork.id).then(() => onSaved('Artwork published to your public profile.')).catch((publishError) => setError(publishError instanceof Error ? publishError.message : 'Artwork could not be published.'))} className="min-h-11 rounded bg-accent px-4 text-sm font-medium text-background disabled:opacity-50">Publish artwork</button>
                  ) : (
                    <button type="button" disabled={busy || !draft.title.trim() || draft.images.length === 0 || (!legacyCurrency && !draft.price) || (artwork !== null && !['DRAFT', 'REJECTED'].includes(artwork.status))} onClick={() => void save(true)} className="min-h-11 rounded bg-accent px-4 text-sm font-medium text-background disabled:opacity-50">{busy ? 'Submitting…' : 'Submit for moderation'}</button>
                  )}
                </>
              )}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function ArtworksContent() {
  const [artworks, setArtworks] = useState<StudioArtwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [wizardArtwork, setWizardArtwork] = useState<StudioArtwork | null | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewArtwork, setPreviewArtwork] = useState<StudioArtwork | null>(null);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      setArtworks((await fetchStudioArtworks()).artworks);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your artworks.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => artworks.filter((artwork) =>
    (status === 'ALL' || artwork.status === status) &&
    `${artwork.title} ${artwork.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [artworks, query, status]);

  function openEditor(artwork: StudioArtwork | null) {
    setWizardArtwork(artwork);
  }

  function draftFromArtwork(artwork: StudioArtwork): WizardDraft {
    return {
      title: artwork.title,
      description: artwork.description ?? '',
      materials: artwork.materials ?? '',
      yearCreated: artwork.yearCreated ? String(artwork.yearCreated) : '',
      width: artwork.width ?? '',
      height: artwork.height ?? '',
      depth: artwork.depth ?? '',
      price: artwork.price,
      images: artwork.images,
    };
  }

  async function archive(artwork: StudioArtwork) {
    setBusyId(artwork.id);
    setError('');
    setFeedback('');
    try {
      await archiveStudioArtwork(artwork.id);
      setFeedback(`${artwork.title} was archived.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Artwork could not be archived.');
    } finally {
      setBusyId(null);
    }
  }

  async function publish(artwork: StudioArtwork) {
    setBusyId(artwork.id);
    setError('');
    setFeedback('');
    try {
      await publishStudioArtwork(artwork.id);
      setFeedback(`${artwork.title} is now published.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Artwork could not be published.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <StudioShell>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/10 pb-6">
        <div>
          <p className="text-xs uppercase tracking-[.18em] text-accent">Your collection</p>
          <h1 className="mt-2 font-display text-4xl">My Artworks</h1>
          <p className="mt-2 text-sm text-muted">Manage real listing states, images and pricing.</p>
        </div>
        <button type="button" onClick={() => openEditor(null)} className="min-h-11 rounded bg-accent px-5 text-sm font-medium text-background">Create artwork</button>
      </header>
      {feedback && <p role="status" className="mt-4 text-sm text-emerald-400">{feedback}</p>}
      {error && <div role="alert" className="mt-4 flex flex-wrap justify-between gap-3 text-sm text-red-300"><span>{error}</span><button type="button" onClick={() => void load()} className="underline">Reload</button></div>}

      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_220px]">
        <label className="text-xs uppercase tracking-wide text-muted">Search artworks
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or description" className="mt-1 min-h-11 w-full rounded border border-border/15 bg-surface px-3 text-sm normal-case text-foreground" />
        </label>
        <label className="text-xs uppercase tracking-wide text-muted">Listing status
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 min-h-11 w-full rounded border border-border/15 bg-surface px-3 text-sm normal-case text-foreground">
            <option value="ALL">All statuses</option>
            {STATUSES.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <div role="status" aria-label="Loading artworks" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-72 animate-pulse rounded-lg bg-surface" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 border-y border-border/10 py-12 text-center">
          <h2 className="font-display text-2xl">{artworks.length ? 'No artworks match these filters' : 'Your collection starts here'}</h2>
          <p className="mt-2 text-sm text-muted">{artworks.length ? 'Adjust your search or status filter.' : 'Create a draft, add artwork imagery and submit it when ready.'}</p>
          {!artworks.length && <button type="button" onClick={() => openEditor(null)} className="mt-5 min-h-11 rounded bg-accent px-5 text-sm text-background">Create your first artwork</button>}
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((artwork) => (
            <li key={artwork.id} className="overflow-hidden rounded-lg border border-border/10 bg-surface">
              <div className="relative aspect-[4/3] bg-background">
                {artwork.imageUrl && <Image src={artwork.imageUrl} alt={artwork.title} fill sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw" className="object-cover" />}
                {!artwork.imageUrl && <div className="flex h-full items-center justify-center text-sm text-muted">Artwork image unavailable</div>}
              </div>
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="font-display text-xl">{artwork.title}</h2><p className="mt-1 font-mono text-sm">{formatListingPrice(artwork.price, artwork.currency)}</p></div>
                  <span className="rounded border border-border/15 px-2 py-1 text-[10px] uppercase tracking-wide text-muted">{artwork.status.replaceAll('_', ' ')}</span>
                </div>
                <p className="text-xs text-muted">{STATUS_COPY[artwork.status]}</p>
                {artwork.status === 'REJECTED' && <p className="border-l-2 border-amber-500 pl-3 text-sm text-amber-200">{artwork.moderationHistory[0]?.reason ?? 'Review the details and resubmit for moderation.'}</p>}
                {artwork.priceReconciliationRequired && <p className="text-xs text-amber-200">Legacy {artwork.currency} amount is not converted or presented as USD.</p>}
                <div className="flex flex-wrap gap-2 border-t border-border/10 pt-3">
                  <button type="button" onClick={() => setPreviewArtwork(artwork)} className="min-h-10 rounded border border-border/20 px-3 text-xs">Preview</button>
                  {['DRAFT', 'REJECTED'].includes(artwork.status) && <button type="button" onClick={() => openEditor(artwork)} className="min-h-10 rounded border border-border/20 px-3 text-xs">Edit</button>}
                  {artwork.status === 'APPROVED' && <button type="button" disabled={busyId === artwork.id} onClick={() => void publish(artwork)} className="min-h-10 rounded bg-accent px-3 text-xs text-background disabled:opacity-50">Publish</button>}
                  {['DRAFT', 'REJECTED', 'APPROVED', 'PUBLISHED'].includes(artwork.status) && <button type="button" disabled={busyId === artwork.id} onClick={() => void archive(artwork)} className="min-h-10 rounded px-3 text-xs text-muted underline disabled:opacity-50">Archive</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {wizardArtwork !== undefined && (
        <ArtworkWizard
          key={wizardArtwork?.id ?? 'create'}
          artwork={wizardArtwork}
          initial={wizardArtwork ? draftFromArtwork(wizardArtwork) : emptyDraft()}
          onClose={() => setWizardArtwork(undefined)}
          onSaved={(message) => {
            setWizardArtwork(undefined);
            setFeedback(message);
            void load();
          }}
        />
      )}
      {previewArtwork && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-4" role="presentation" onClick={() => setPreviewArtwork(null)}>
          <section role="dialog" aria-modal="true" aria-label="Artwork preview" onClick={(event) => event.stopPropagation()} className="mx-auto my-6 max-w-2xl rounded-lg bg-background p-5">
            <button type="button" onClick={() => setPreviewArtwork(null)} className="float-right min-h-10 px-3" aria-label="Close preview">Close</button>
            <p className="text-xs uppercase tracking-wide text-muted">{previewArtwork.status.replaceAll('_', ' ')}</p>
            <h2 className="mt-2 font-display text-3xl">{previewArtwork.title}</h2>
            <p className="mt-2 font-mono">{formatListingPrice(previewArtwork.price, previewArtwork.currency)}</p>
            {previewArtwork.imageUrl && <div className="relative mt-5 aspect-[4/3]"><Image src={previewArtwork.imageUrl} alt={previewArtwork.title} fill sizes="90vw" className="object-contain" /></div>}
            <p className="mt-4 whitespace-pre-wrap text-sm text-muted">{previewArtwork.description}</p>
            {previewArtwork.status !== 'PUBLISHED' && <p className="mt-4 text-xs text-amber-200">This is a Studio preview, not a public listing.</p>}
          </section>
        </div>
      )}
    </StudioShell>
  );
}

export default function StudioArtworksPage() {
  return <ProtectedRoute allowRoles={['ARTIST']}><ArtworksContent /></ProtectedRoute>;
}
