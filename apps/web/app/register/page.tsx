'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { AuthLayout } from '../../components/auth/AuthLayout';
import { AuthField } from '../../components/auth/AuthField';
import { AuthSubmitButton } from '../../components/auth/AuthSubmitButton';
import { FormAlert } from '../../components/auth/FormAlert';
import { Reveal } from '../../components/ui/Reveal';
import { resolveAuthDestination } from '../../lib/authRouting';
import { registerWithEmail, loginWithGoogle, mapFirebaseError } from '../../lib/authClient';

type Intent = 'artist' | 'buyer';

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawIntent = searchParams.get('intent');
  const intent: Intent | null = rawIntent === 'artist' || rawIntent === 'buyer' ? rawIntent : null;

  useEffect(() => {
    if (!intent) router.replace('/welcome');
  }, [intent, router]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!intent) return null;

  const backendIntent = intent === 'artist' ? 'ARTIST' : 'BUYER';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const body = await registerWithEmail({
        email,
        password,
        firstName,
        lastName,
        intent: backendIntent,
      });
      router.push(resolveAuthDestination(body));
      router.refresh();
    } catch (err) {
      setFormError(mapFirebaseError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setGoogleSubmitting(true);
    setFormError(null);
    try {
      const body = await loginWithGoogle(backendIntent);
      router.push(resolveAuthDestination(body));
      router.refresh();
    } catch (err) {
      setFormError(mapFirebaseError(err));
    } finally {
      setGoogleSubmitting(false);
    }
  }

  const isArtist = intent === 'artist';

  return (
    <AuthLayout
      image="/images/hero/hero-04.jpg"
      quote="“Build your presence. Share your work. Find your audience.”"
    >
      <Reveal>
        <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">
          {isArtist ? 'Join as an Artist' : 'Join Artist_Platform'}
        </p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] text-foreground">
          {isArtist ? (
            <>
              Showcase your <span className="italic text-accent">work.</span>
            </>
          ) : (
            <>
              Create your <span className="italic text-accent">presence.</span>
            </>
          )}
        </h1>
      </Reveal>

      <Reveal delay={100}>
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleSubmitting}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg border border-foreground/10 px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent disabled:opacity-60"
        >
          {googleSubmitting ? 'Connecting…' : 'Continue with Google'}
        </button>
        <div className="my-6 flex items-center gap-4">
          <span className="h-px flex-1 bg-foreground/10" />
          <span className="text-xs uppercase tracking-widest text-muted">or</span>
          <span className="h-px flex-1 bg-foreground/10" />
        </div>
      </Reveal>

      <Reveal delay={120}>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          {formError && <FormAlert message={formError} />}
          <div className="grid grid-cols-2 gap-4">
            <AuthField
              id="firstName"
              label="First name"
              type="text"
              name="firstName"
              autoComplete="given-name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <AuthField
              id="lastName"
              label="Last name"
              type="text"
              name="lastName"
              autoComplete="family-name"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <AuthField
            id="email"
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div>
            <AuthField
              id="password"
              label="Password"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-muted">At least 8 characters.</p>
          </div>
          <div className="mt-2">
            <AuthSubmitButton
              submitting={submitting}
              label="Create account"
              submittingLabel="Creating account…"
            />
          </div>
        </form>
      </Reveal>

      <Reveal delay={200}>
        <p className="mt-8 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent underline underline-offset-2">
            Log in
          </Link>
        </p>
      </Reveal>
    </AuthLayout>
  );
}
