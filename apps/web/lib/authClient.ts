import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  confirmPasswordReset,
  sendEmailVerification,
  updateProfile,
  signOut as firebaseSignOut,
  type UserCredential,
} from 'firebase/auth';
import { firebaseAuth, googleProvider } from './firebaseClient';
import type { AuthSuccessBody } from './authRouting';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function syncWithBackend(
  credential: Pick<UserCredential, 'user'>,
  extra?: { intent?: 'ARTIST' | 'BUYER'; firstName?: string; lastName?: string },
): Promise<AuthSuccessBody> {
  const idToken = await credential.user.getIdToken();
  const res = await fetch(`${API_BASE}/api/v1/auth/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(extra ?? {}),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    const error = new Error(body.code?.toLowerCase() ?? 'backend_sync_failed');
    (error as Error & { code?: string }).code = body.code?.toLowerCase();
    throw error;
  }
  return res.json();
}

export async function registerWithEmail(params: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  intent: 'ARTIST' | 'BUYER';
}): Promise<AuthSuccessBody> {
  const credential = await createUserWithEmailAndPassword(
    firebaseAuth,
    params.email,
    params.password,
  );
  await updateProfile(credential.user, {
    displayName: `${params.firstName} ${params.lastName}`.trim(),
  });
  await sendEmailVerification(credential.user);
  return syncWithBackend(credential, {
    intent: params.intent,
    firstName: params.firstName,
    lastName: params.lastName,
  });
}

export async function loginWithEmail(email: string, password: string): Promise<AuthSuccessBody> {
  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  return syncWithBackend(credential);
}

export async function loginWithGoogle(intent?: 'ARTIST' | 'BUYER'): Promise<AuthSuccessBody> {
  const credential = await signInWithPopup(firebaseAuth, googleProvider);
  return syncWithBackend(credential, intent ? { intent } : undefined);
}

export async function sendResetEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth, email, {
    url: `${window.location.origin}/reset-password`,
    handleCodeInApp: true,
  });
}

export async function confirmReset(oobCode: string, newPassword: string): Promise<void> {
  await confirmPasswordReset(firebaseAuth, oobCode, newPassword);
}

export async function logout(): Promise<void> {
  await firebaseSignOut(firebaseAuth);
}

export function mapFirebaseError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'The email or password is incorrect.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'backend_sync_failed':
      return 'Your account could not be loaded. Please refresh and try again.';
    case 'intent_required':
      return 'Choose whether you want to buy or sell artwork before creating an account.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
