const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ContactFormInput {
  name: string;
  email: string;
  subject: string;
  message: string;
}

// Public endpoint — no auth header, matching the backend route, which
// deliberately has no requireAuth (a visitor filling out a contact
// form isn't expected to be logged in).
export async function submitContactMessage(input: ContactFormInput): Promise<string> {
  const res = await fetch(`${API_URL}/api/v1/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? 'Could not send your message. Please try again.');
  }

  const json = await res.json();
  return json.data.id as string;
}

// Best-effort, fire-and-forget — the message is already safely stored
// by the time this is called. Losing this update just means the admin
// inbox won't show whether the notification email succeeded, nothing
// more serious than that.
export async function reportEmailOutcome(id: string, sent: boolean, error?: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/v1/contact/${id}/email-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sent, error }),
    });
  } catch {
    /* intentionally swallowed — see comment above */
  }
}
