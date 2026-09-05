export type SignupIntent = 'artist' | 'buyer';
export type BackendIntent = 'ARTIST' | 'BUYER';

export function parseSignupIntent(raw: string | null): SignupIntent | null {
  return raw === 'artist' || raw === 'buyer' ? raw : null;
}

export function toBackendIntent(intent: SignupIntent): BackendIntent {
  return intent === 'artist' ? 'ARTIST' : 'BUYER';
}
