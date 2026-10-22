'use client';

import { useState, type FormEvent } from 'react';
import type { ArtistRequest, SubmittedResponse } from '../../lib/verificationTypes';
import { FIELD_CATALOGUE } from '../../lib/verificationTypes';

function portfolioUrlError(raw: string): string | null {
  if (/[\u0000-\u001f\u007f-\u009f]/.test(raw)) {
    return 'Portfolio links must not contain control characters';
  }

  const value = raw.trim();
  if (!value) return null;
  if (!/^https:\/\//i.test(value) || value.includes('\\')) {
    return 'Only HTTPS links are accepted. Enter a full URL beginning with https://';
  }
  const authority = value.match(/^https:\/\/([^/?#\\\s]+)(?:[/?#]|$)/i)?.[1];
  if (!authority) {
    return 'Enter a valid HTTPS URL, for example https://example.com/portfolio';
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname) {
      return 'Enter a valid HTTPS URL, for example https://example.com/portfolio';
    }
    if (authority.includes('@') || url.username || url.password) {
      return 'HTTPS links must not contain a username or password';
    }
  } catch {
    return 'Enter a valid HTTPS URL, for example https://example.com/portfolio';
  }
  return null;
}

/*
  Explainer: the form is GENERATED from the request the server stored — the
  fields, labels, instructions and required flags are whatever staff asked
  for in this round, not a fixed list. It sends back only answers keyed by
  field id; the server re-validates them against its own stored copy and
  returns per-field errors, which are shown next to the field. URLs and text
  only: there is deliberately no file control.
*/
export function VerificationRequestForm({
  request,
  onSubmit,
}: {
  request: ArtistRequest;
  /** Resolves with per-field errors keyed by field id (empty = success). */
  onSubmit: (responses: SubmittedResponse[]) => Promise<Record<string, string> | void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    // Light client-side checks for fast feedback; the server is the authority.
    const local: Record<string, string> = {};
    for (const field of request.fields) {
      const value = values[field.id] ?? '';
      if (field.required && !value.trim()) {
        local[field.id] = `${field.label} is required`;
      } else if (field.type === 'PORTFOLIO_URL') {
        const problem = portfolioUrlError(value);
        if (problem) local[field.id] = problem;
      }
    }
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    setBusy(true);
    const result = await onSubmit(
      request.fields.map((f) => ({ fieldId: f.id, value: values[f.id] ?? '' })),
    );
    setBusy(false);
    if (result) setErrors(result);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {request.fields.map((field) => {
        const kind = FIELD_CATALOGUE[field.type]?.kind ?? 'text';
        const error = errors[field.id];
        const hintId = `${field.id}-hint`;
        const errorId = `${field.id}-error`;
        const common = {
          id: field.id,
          name: field.id,
          value: values[field.id] ?? '',
          onChange: (e: { target: { value: string } }) =>
            setValues((v) => ({ ...v, [field.id]: e.target.value })),
          'aria-invalid': error ? true : undefined,
          'aria-describedby': error ? `${hintId} ${errorId}` : hintId,
          className:
            'mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground ' +
            (error ? 'border-red-500/60' : 'border-border/15'),
        } as const;

        return (
          <div key={field.id}>
            <label htmlFor={field.id} className="block text-sm font-medium text-foreground">
              {field.label}{' '}
              <span className="text-xs font-normal text-muted">
                ({field.required ? 'required' : 'optional'})
              </span>
            </label>
            <p id={hintId} className="mt-1 text-sm text-muted">
              {field.instructions}
            </p>
            {kind === 'url' ? (
              <>
                <input {...common} type="url" inputMode="url" placeholder="https://" maxLength={2048} />
                <p className="mt-1 text-xs text-muted">
                  Use an absolute HTTPS address beginning with https://.
                </p>
              </>
            ) : (
              <textarea {...common} rows={5} maxLength={5000} />
            )}
            {error && (
              <p id={errorId} role="alert" className="mt-1 text-sm text-red-400">
                {error}
              </p>
            )}
          </div>
        );
      })}

      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        {busy ? 'Submitting…' : 'Submit response'}
      </button>
    </form>
  );
}
