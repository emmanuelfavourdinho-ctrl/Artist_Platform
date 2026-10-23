'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { AdminApiError } from '../../../lib/adminApi';
import {
  decideArtwork,
  fetchArtworkDetail,
  fetchArtworkQueue,
  type ArtworkModerationItem,
} from '../../../lib/artworkModerationApi';
import { useAdminSession } from '../../../components/admin/AdminSessionContext';
import { EmptyBox, ErrorBox, PageHeader, Pagination } from '../../../components/admin/AdminUi';

const PAGE_SIZE = 20;

function labelList(
  items: {
    category?: { name: string };
    style?: { name: string };
    theme?: { name: string };
    medium?: { name: string };
  }[],
) {
  return (
    items
      .map(
        (item) => item.category?.name ?? item.style?.name ?? item.theme?.name ?? item.medium?.name,
      )
      .filter(Boolean)
      .join(', ') || '—'
  );
}

export default function ArtworkModerationPage() {
  const { can } = useAdminSession();
  const allowed = can('artworks.moderate');
  const [rows, setRows] = useState<ArtworkModerationItem[] | null>(null);
  const [pagination, setPagination] = useState<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<ArtworkModerationItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchArtworkQueue({ page, pageSize: PAGE_SIZE });
      const pageCount = result.pagination?.totalPages ?? 0;
      if (page > Math.max(1, pageCount)) {
        setPage(Math.max(1, pageCount));
        return;
      }
      setRows(result.data);
      setPagination(result.pagination ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the artwork queue.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load, reloadKey]);

  const openDetails = async (row: ArtworkModerationItem) => {
    setSelected(row);
    setDetailLoading(true);
    setDetailError(null);
    setDecisionError(null);
    setDecision(null);
    setReason('');
    try {
      setSelected(await fetchArtworkDetail(row.id));
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Could not load artwork details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshQueue = (stale: boolean) => {
    setSelected(null);
    setDecision(null);
    setReason('');
    setDetailError(null);
    setDecisionError(null);
    setNotice(stale ? 'This artwork was already moderated. The queue has been refreshed.' : null);
    if (rows?.length === 1 && page > 1) setPage((current) => current - 1);
    else setReloadKey((current) => current + 1);
  };

  const submitDecision = async () => {
    if (!selected || !decision || submitting) return;
    setSubmitting(true);
    setDecisionError(null);
    try {
      await decideArtwork(selected.id, {
        action: decision,
        ...(decision === 'reject' ? { reason: reason.trim() } : {}),
      });
      refreshQueue(false);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) {
        refreshQueue(true);
      } else {
        setDecisionError(
          err instanceof Error ? err.message : 'Could not save the moderation decision.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!allowed)
    return (
      <p role="alert" className="text-sm text-red-400">
        You do not have permission to moderate artwork.
      </p>
    );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Marketplace"
        title="Artwork moderation"
        description="Review submitted artwork before it can proceed through the artist publishing workflow. Approval does not publish or change visibility."
        action={
          <p className="text-sm text-muted">
            {pagination?.total ?? 0} pending artwork{pagination?.total === 1 ? '' : 's'}
          </p>
        }
      />

      {notice && (
        <p
          role="status"
          className="rounded-md border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-foreground"
        >
          {notice}
        </p>
      )}
      {error && <ErrorBox message={error} onRetry={() => setReloadKey((key) => key + 1)} />}
      {loading && (
        <div role="status" aria-label="Loading artwork queue" className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      )}
      {!loading && !error && rows?.length === 0 && (
        <EmptyBox
          title="No artwork waiting for review"
          description="Submitted artwork with pending review will appear here."
        />
      )}

      {!loading && !error && !!rows?.length && (
        <ul className="space-y-3">
          {rows.map((artwork) => (
            <li
              key={artwork.id}
              className="flex flex-col gap-4 rounded-lg border border-border/10 bg-surface p-4 sm:flex-row sm:items-center"
            >
              {artwork.images[0] && (
                <Image
                  src={artwork.images[0].url}
                  alt={artwork.images[0].altText ?? artwork.title}
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-md object-cover"
                  unoptimized
                />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-medium text-foreground">{artwork.title}</h2>
                <p className="mt-1 text-sm text-muted">
                  By {artwork.artist.displayName} · {artwork.currency}{' '}
                  {Number(artwork.price).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Submitted {new Date(artwork.createdAt).toLocaleDateString()} ·{' '}
                  {artwork.visibility}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void openDetails(artwork)}
                className="rounded-md border border-border/15 px-4 py-2 text-sm hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                Review details
              </button>
            </li>
          ))}
        </ul>
      )}

      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onChange={setPage}
        />
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="artwork-title"
            className="my-8 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-border/15 bg-background p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-accent">Pending review</p>
                <h2 id="artwork-title" className="mt-1 font-display text-2xl">
                  {selected.title}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close details"
                disabled={submitting}
                onClick={() => setSelected(null)}
                className="text-sm text-muted hover:text-foreground"
              >
                Close
              </button>
            </div>
            {detailLoading ? (
              <p role="status" className="py-10 text-center text-sm text-muted">
                Loading artwork details…
              </p>
            ) : (
              <>
                {detailError && (
                  <ErrorBox message={detailError} onRetry={() => void openDetails(selected)} />
                )}
                <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,1fr)_16rem]">
                  <div>
                    <div className="grid grid-cols-2 gap-2">
                      {selected.images.map((image) => (
                        <Image
                          key={image.id}
                          src={image.url}
                          alt={image.altText ?? selected.title}
                          width={600}
                          height={600}
                          className="max-h-72 w-full rounded-md object-contain bg-surface"
                          unoptimized
                        />
                      ))}
                    </div>
                    <p className="mt-4 whitespace-pre-wrap text-sm text-foreground/85">
                      {selected.description || 'No description provided.'}
                    </p>
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase text-muted">Artist</dt>
                      <dd>{selected.artist.displayName}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted">Price</dt>
                      <dd>
                        {selected.currency} {Number(selected.price).toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted">Materials</dt>
                      <dd>{selected.materials || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted">Categories</dt>
                      <dd>{labelList(selected.categories)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted">Styles</dt>
                      <dd>{labelList(selected.styles)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted">Themes</dt>
                      <dd>{labelList(selected.themes)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted">Mediums</dt>
                      <dd>{labelList(selected.mediums)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted">Visibility</dt>
                      <dd>{selected.visibility}</dd>
                    </div>
                  </dl>
                </div>
                {detailError && (
                  <p role="alert" className="mt-4 text-sm text-red-400">
                    {detailError}
                  </p>
                )}
                <div className="mt-6 border-t border-border/10 pt-5">
                  {!detailError &&
                    (decision === null ? (
                      <div className="flex flex-wrap justify-end gap-3">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => setDecision('reject')}
                          className="rounded-md border border-red-500/30 px-4 py-2 text-sm text-red-300 disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => setDecision('approve')}
                          className="rounded-md bg-accent px-4 py-2 text-sm text-background disabled:opacity-50"
                        >
                          Approve
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <h3 className="text-sm font-medium">
                          Confirm {decision === 'approve' ? 'approval' : 'rejection'}
                        </h3>
                        {decision === 'reject' && (
                          <label className="block text-sm">
                            Rejection reason{' '}
                            <textarea
                              aria-label="Rejection reason"
                              value={reason}
                              onChange={(event) => setReason(event.target.value)}
                              maxLength={500}
                              rows={3}
                              className="mt-1 w-full rounded-md border border-border/15 bg-surface px-3 py-2"
                              placeholder="Explain what needs to change (at least 10 characters)."
                            />
                          </label>
                        )}
                        {decisionError && (
                          <p role="alert" className="text-sm text-red-400">
                            {decisionError}
                          </p>
                        )}
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => {
                              setDecision(null);
                              setDecisionError(null);
                            }}
                            className="rounded-md border border-border/15 px-4 py-2 text-sm disabled:opacity-50"
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            disabled={
                              submitting || (decision === 'reject' && reason.trim().length < 10)
                            }
                            onClick={() => void submitDecision()}
                            className="rounded-md bg-accent px-4 py-2 text-sm text-background disabled:opacity-50"
                          >
                            {submitting
                              ? 'Saving…'
                              : `Confirm ${decision === 'approve' ? 'approval' : 'rejection'}`}
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
