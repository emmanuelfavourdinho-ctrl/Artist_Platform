'use client';

import { useState, type FormEvent } from 'react';
import {
  FIELD_CATALOGUE,
  type NewRequestField,
  type VerificationFieldType,
} from '../../lib/verificationTypes';
import { ErrorBox } from './AdminUi';

interface Draft {
  selected: boolean;
  label: string;
  instructions: string;
  required: boolean;
}

const TYPES = Object.keys(FIELD_CATALOGUE) as VerificationFieldType[];

/*
  Explainer: a two-step composer. Step 1 builds the request from the
  approved catalogue only (there is no free-form field type to add). Step 2
  shows exactly what the artist will be asked, and nothing is sent until
  the reviewer confirms there. The server still validates and rebuilds the
  field definitions itself — this form only supplies the type, optional
  label, instructions and required flag.
*/
export function VerificationRequestComposer({
  onSubmit,
  onCancel,
  busy = false,
  error,
}: {
  onSubmit: (payload: { message?: string; fields: NewRequestField[] }) => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [step, setStep] = useState<'compose' | 'confirm'>('compose');
  const [message, setMessage] = useState('');
  const [drafts, setDrafts] = useState<Record<VerificationFieldType, Draft>>({
    PORTFOLIO_URL: { selected: false, label: '', instructions: '', required: true },
    ADDITIONAL_DETAILS: { selected: false, label: '', instructions: '', required: true },
  });

  const update = (type: VerificationFieldType, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [type]: { ...d[type], ...patch } }));

  const chosen = TYPES.filter((t) => drafts[t].selected);
  const valid = chosen.length > 0 && chosen.every((t) => drafts[t].instructions.trim().length > 0);

  const payload = () => ({
    message: message.trim() || undefined,
    fields: chosen.map((type) => ({
      type,
      label: drafts[type].label.trim() || undefined,
      instructions: drafts[type].instructions.trim(),
      required: drafts[type].required,
    })),
  });

  function next(event: FormEvent) {
    event.preventDefault();
    if (valid) setStep('confirm');
  }

  const input =
    'mt-1 w-full rounded-md border border-border/15 bg-background px-3 py-2 text-sm text-foreground';

  if (step === 'confirm') {
    const request = payload();
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-medium text-foreground">The artist will be asked to provide</h3>
          <ul className="mt-3 space-y-3" aria-label="Requested information">
            {request.fields.map((f) => (
              <li key={f.type} className="rounded-md border border-border/10 bg-background px-4 py-3 text-sm">
                <p className="text-foreground">
                  {f.label ?? FIELD_CATALOGUE[f.type].label}{' '}
                  <span className="text-xs text-muted">({f.required ? 'required' : 'optional'})</span>
                </p>
                <p className="mt-1 text-foreground/80">{f.instructions}</p>
              </li>
            ))}
          </ul>
          {request.message && (
            <p className="mt-3 text-sm text-foreground/80">Message: {request.message}</p>
          )}
        </div>
        <p className="text-xs text-muted">
          The artist is notified in the app and sees this on their dashboard. Sending a request does
          not verify or reject them.
        </p>
        {error && <ErrorBox message={error} />}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setStep('compose')}
            disabled={busy}
            className="rounded-md border border-border/15 px-4 py-2 text-sm disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => onSubmit(request)}
            disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={next} className="space-y-5">
      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-foreground">What do you need from the artist?</legend>
        {TYPES.map((type) => {
          const draft = drafts[type];
          const meta = FIELD_CATALOGUE[type];
          return (
            <div key={type} className="rounded-md border border-border/10 bg-background p-4">
              <label className="flex items-start gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.selected}
                  onChange={(e) => update(type, { selected: e.target.checked })}
                  className="mt-1"
                />
                <span>
                  {meta.label}
                  <span className="block text-xs text-muted">{meta.help}</span>
                </span>
              </label>

              {draft.selected && (
                <div className="mt-4 space-y-3 pl-7">
                  <label className="block text-sm text-foreground">
                    Label shown to the artist <span className="text-muted">(optional)</span>
                    <input
                      value={draft.label}
                      onChange={(e) => update(type, { label: e.target.value })}
                      maxLength={100}
                      placeholder={meta.label}
                      className={input}
                    />
                  </label>
                  <label className="block text-sm text-foreground">
                    Instructions
                    <textarea
                      value={draft.instructions}
                      onChange={(e) => update(type, { instructions: e.target.value })}
                      maxLength={500}
                      rows={3}
                      required
                      className={input}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={draft.required}
                      onChange={(e) => update(type, { required: e.target.checked })}
                    />
                    Required
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </fieldset>

      <label className="block text-sm text-foreground">
        Message to the artist <span className="text-muted">(optional)</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          rows={3}
          className={input}
        />
      </label>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="rounded-md border border-border/15 px-4 py-2 text-sm">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!valid}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40"
        >
          Review request
        </button>
      </div>
    </form>
  );
}
