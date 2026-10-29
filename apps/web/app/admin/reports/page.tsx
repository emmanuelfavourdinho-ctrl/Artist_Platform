'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { AdminApiError, adminRequest, type Pagination } from '../../../lib/adminApi';
import {
  EmptyBox,
  ErrorBox,
  PageHeader,
  Pagination as Pager,
} from '../../../components/admin/AdminUi';
import { useAdminSession } from '../../../components/admin/AdminSessionContext';

type Report = {
  id: string;
  targetType: 'USER' | 'ARTWORK';
  reason: string;
  description: string | null;
  status: 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';
  resolutionNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  subject: null | {
    type: 'USER' | 'ARTWORK';
    id: string;
    slug?: string;
    firstName?: string;
    lastName?: string;
    title?: string;
    status?: string;
    visibility?: string;
    artistProfile?: { displayName: string; slug: string } | null;
    artist?: { displayName: string; slug: string };
  };
};

const PAGE_SIZE = 20;

export default function ReportsPage() {
  const { can } = useAdminSession();
  const canManage = can('reports.manage');
  const [rows, setRows] = useState<Report[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('OPEN');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async (requestedPage: number, requestedFilter: string) => {
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, string | number> = { page: requestedPage, pageSize: PAGE_SIZE };
      if (requestedFilter === 'OPEN') query.status = 'OPEN';
      else if (requestedFilter !== 'ALL') query.status = requestedFilter;
      const result = await adminRequest<Report[]>('GET', '/admin/reports', { query });
      setRows(result.data);
      setPagination(result.pagination ?? null);
      if (result.pagination && requestedPage > Math.max(1, result.pagination.totalPages)) {
        setPage(Math.max(1, result.pagination.totalPages));
      } else setPage(requestedPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) void load(page, filter);
  }, [canManage, load, page, filter]);

  async function decide(report: Report, status: 'REVIEWING' | 'RESOLVED' | 'DISMISSED') {
    const resolutionNote = notes[report.id]?.trim();
    if (status !== 'REVIEWING' && (!resolutionNote || resolutionNote.length < 10)) {
      setNotice('For a final decision, enter a resolution note of at least 10 characters.');
      return;
    }
    setNotice(null);
    setBusyId(report.id);
    try {
      await adminRequest('PATCH', `/admin/reports/${report.id}`, {
        body: { status, ...(status === 'REVIEWING' ? {} : { resolutionNote }) },
      });
      setNotice('Report updated.');
      await load(page, filter);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) {
        setNotice('This report changed while you were viewing it. The queue has been refreshed.');
        await load(page, filter);
      } else setNotice(err instanceof Error ? err.message : 'Could not update this report.');
    } finally {
      setBusyId(null);
    }
  }

  if (!canManage) return <ErrorBox message="You do not have permission to manage reports." />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trust & Support"
        title="Reports & Investigations"
        description="Review reported artists and public artwork, track investigation status, and record outcomes."
      />
      <label className="block text-sm text-muted">
        View reports
        <select
          aria-label="View reports"
          className="ml-3 rounded border border-border/20 bg-surface px-3 py-2 text-foreground"
          value={filter}
          onChange={(e) => {
            setPage(1);
            setFilter(e.target.value);
          }}
        >
          <option value="OPEN">Open</option>
          <option value="PENDING">Pending</option>
          <option value="REVIEWING">Reviewing</option>
          <option value="RESOLVED">Resolved</option>
          <option value="DISMISSED">Dismissed</option>
          <option value="ALL">All</option>
        </select>
      </label>
      {notice && (
        <p role="status" className="rounded border border-border/20 px-4 py-3 text-sm">
          {notice}
        </p>
      )}
      {error && <ErrorBox message={error} onRetry={() => void load(page, filter)} />}
      {loading ? (
        <p role="status" className="py-8 text-sm text-muted">
          Loading reports…
        </p>
      ) : !error && rows.length === 0 ? (
        <EmptyBox
          title="No reports in this view"
          description="Try another filter or return when new reports arrive."
        />
      ) : (
        !error && (
          <>
            <ul className="space-y-4">
              {rows.map((report) => {
                const subject = report.subject;
                const subjectLabel =
                  report.targetType === 'USER'
                    ? subject?.artistProfile?.displayName ||
                      [subject?.firstName, subject?.lastName].filter(Boolean).join(' ') ||
                      'Unavailable artist'
                    : (subject?.title ?? 'Unavailable artwork');
                const subjectHref =
                  report.targetType === 'USER'
                    ? subject?.artistProfile?.slug
                      ? `/artists/${subject.artistProfile.slug}`
                      : null
                    : subject?.slug
                      ? `/artwork/${subject.slug}`
                      : null;
                return (
                  <li key={report.id} className="rounded-lg border border-border/10 bg-surface p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted">
                          {report.targetType} · {report.status.replace('_', ' ')}
                        </p>
                        <h2 className="mt-1 text-lg text-foreground">
                          {subjectHref ? (
                            <Link
                              href={subjectHref as Route}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-4"
                            >
                              {subjectLabel}
                            </Link>
                          ) : (
                            subjectLabel
                          )}
                        </h2>
                      </div>
                      <time className="text-xs text-muted">
                        {new Date(report.createdAt).toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-4 text-sm">
                      <strong>Reason:</strong> {report.reason}
                    </p>
                    {report.description && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                        {report.description}
                      </p>
                    )}
                    {subject && (
                      <p className="mt-2 text-xs text-muted">
                        Subject status: {subject.status ?? 'unknown'}
                        {subject.visibility ? ` · ${subject.visibility}` : ''}
                        {subject.artist ? ` · by ${subject.artist.displayName}` : ''}
                      </p>
                    )}
                    {report.reviewedAt && (
                      <p className="mt-1 text-xs text-muted">
                        Last reviewed {new Date(report.reviewedAt).toLocaleString()}
                      </p>
                    )}
                    {report.resolutionNote && (
                      <p className="mt-2 text-sm">
                        <strong>Resolution:</strong> {report.resolutionNote}
                      </p>
                    )}
                    {report.status === 'PENDING' || report.status === 'REVIEWING' ? (
                      <div className="mt-5 space-y-3">
                        <label className="block text-xs text-muted">
                          Resolution note (required to resolve or dismiss)
                          <textarea
                            className="mt-1 block w-full rounded border border-border/20 bg-background p-3 text-sm text-foreground"
                            minLength={10}
                            maxLength={1000}
                            rows={2}
                            value={notes[report.id] ?? ''}
                            onChange={(e) =>
                              setNotes((old) => ({ ...old, [report.id]: e.target.value }))
                            }
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {report.status === 'PENDING' && (
                            <button
                              disabled={busyId !== null}
                              onClick={() => void decide(report, 'REVIEWING')}
                              className="rounded border border-border/20 px-3 py-2 text-xs disabled:opacity-50"
                            >
                              {busyId === report.id ? 'Saving…' : 'Start review'}
                            </button>
                          )}
                          <button
                            disabled={busyId !== null}
                            onClick={() => void decide(report, 'RESOLVED')}
                            className="rounded bg-accent px-3 py-2 text-xs text-background disabled:opacity-50"
                          >
                            Resolve
                          </button>
                          <button
                            disabled={busyId !== null}
                            onClick={() => void decide(report, 'DISMISSED')}
                            className="rounded border border-border/20 px-3 py-2 text-xs disabled:opacity-50"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {pagination && (
              <Pager
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                onChange={setPage}
              />
            )}
          </>
        )
      )}
    </div>
  );
}
