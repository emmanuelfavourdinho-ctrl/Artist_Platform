import type { InputHTMLAttributes } from 'react';

import { FieldError } from './FieldError';

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function AuthField({ label, error, id, ...inputProps }: AuthFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
      >
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        className="mt-2 block w-full rounded-md border border-foreground/15 bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted/60 transition-colors duration-200 focus:border-accent focus:outline-none focus-visible:outline-2"
        {...inputProps}
      />
      <FieldError message={error} />
    </div>
  );
}
