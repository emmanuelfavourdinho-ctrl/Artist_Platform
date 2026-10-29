import { HttpError } from './httpError.js';

/*
  Explainer: the AUTHORITATIVE catalogue of what staff may ask an artist
  for during verification. It lives on the server on purpose: the browser
  can display these types, but can never define one, rename one, or
  smuggle an unknown one into a request or a submission. Adding a field
  type later is a deliberate code change here, not a data change.

  Release 1 is URLs and text only. There is intentionally no file or
  evidence-upload type: nothing in this feature stores or serves files.
*/
export const VERIFICATION_FIELD_CATALOGUE = {
  PORTFOLIO_URL: {
    label: 'Portfolio link',
    kind: 'url',
    maxLength: 2048,
  },
  ADDITIONAL_DETAILS: {
    label: 'Additional details',
    kind: 'text',
    maxLength: 5000,
  },
} as const;

export type VerificationFieldType = keyof typeof VERIFICATION_FIELD_CATALOGUE;

export const VERIFICATION_FIELD_TYPES = Object.keys(VERIFICATION_FIELD_CATALOGUE) as [
  VerificationFieldType,
  ...VerificationFieldType[],
];

/** What is stored (as a snapshot) on a request round, and shown to the artist. */
export interface RequestedField {
  /** Equal to `type`: each type can appear once per request, so the type
   *  is an unambiguous identifier for the answer. */
  id: VerificationFieldType;
  type: VerificationFieldType;
  label: string;
  instructions: string;
  required: boolean;
}

export interface SubmittedResponse {
  fieldId: string;
  value: string;
}

export interface FieldError {
  path: string;
  message: string;
}

/*
  Explainer: URL syntax validation ONLY. A well-formed https:// address is
  not evidence that the artist owns the portfolio, and the server never
  fetches the address (no SSRF surface) — a human reviewer opens it.
  Embedded credentials (https://user:pass@host) are rejected so they can
  never be stored or echoed back into the admin console.
*/
function hasControlChars(value: string): boolean {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
  });
}

export function validateHttpsUrl(raw: string): string | null {
  if (hasControlChars(raw)) {
    return 'Portfolio links must not contain control characters';
  }
  const value = raw.trim();
  if (!/^https:\/\//i.test(value) || value.includes('\\')) {
    return 'Only HTTPS links are accepted. Enter a full URL beginning with https://';
  }
  const authority = value.match(/^https:\/\/([^/?#\\\s]+)(?:[/?#]|$)/i)?.[1];
  if (!authority) {
    return 'Enter a valid HTTPS URL, for example https://example.com/portfolio';
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Enter a valid HTTPS URL, for example https://example.com/portfolio';
  }
  if (url.protocol !== 'https:') {
    return 'Only HTTPS links are accepted. Enter a full URL beginning with https://';
  }
  if (!url.hostname) {
    return 'Enter a valid HTTPS URL, for example https://example.com/portfolio';
  }
  if (authority.includes('@') || url.username || url.password) {
    return 'HTTPS links must not contain a username or password';
  }
  return null;
}

/*
  Explainer: checks an artist's answers against the SNAPSHOT stored on the
  request, never against anything the client sends about the fields. It
  accepts only ids that were actually requested, rejects duplicates,
  enforces required/optional and per-type limits, and returns cleaned
  values (trimmed, optional-and-empty answers dropped). Any problem throws
  a 400 whose `details` name the offending field.
*/
export function validateResponses(
  fields: readonly RequestedField[],
  responses: readonly SubmittedResponse[],
): SubmittedResponse[] {
  const errors: FieldError[] = [];
  const requested = new Map(fields.map((f) => [f.id, f]));
  const seen = new Set<string>();
  const cleaned = new Map<string, string>();
  const rawValues = new Map<string, string>();

  for (const response of responses) {
    const field = requested.get(response.fieldId as VerificationFieldType);
    if (!field) {
      errors.push({ path: response.fieldId, message: 'This field was not requested' });
      continue;
    }
    if (seen.has(response.fieldId)) {
      errors.push({ path: response.fieldId, message: 'This field was provided more than once' });
      continue;
    }
    seen.add(response.fieldId);

    if (field.type === 'PORTFOLIO_URL' && hasControlChars(response.value)) {
      errors.push({ path: field.id, message: 'Portfolio links must not contain control characters' });
      continue;
    }

    const value = response.value.trim();
    if (value) {
      cleaned.set(field.id, value);
      rawValues.set(field.id, response.value);
    }
  }

  for (const field of fields) {
    const value = cleaned.get(field.id);
    const rules = VERIFICATION_FIELD_CATALOGUE[field.type];

    if (!value) {
      if (field.required) errors.push({ path: field.id, message: `${field.label} is required` });
      continue;
    }
    if (value.length > rules.maxLength) {
      errors.push({
        path: field.id,
        message: `${field.label} must be ${rules.maxLength} characters or fewer`,
      });
      continue;
    }
    if (rules.kind === 'url') {
      const problem = validateHttpsUrl(rawValues.get(field.id) ?? value);
      if (problem) errors.push({ path: field.id, message: problem });
    }
  }

  if (errors.length > 0) {
    throw new HttpError(400, errors[0]!.message, { code: 'VALIDATION_ERROR', details: errors });
  }

  return fields
    .filter((f) => cleaned.has(f.id))
    .map((f) => ({ fieldId: f.id, value: cleaned.get(f.id)! }));
}
