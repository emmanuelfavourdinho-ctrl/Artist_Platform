'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { AuthLayout } from '../../components/auth/AuthLayout';
import { AuthField } from '../../components/auth/AuthField';
import { AuthSubmitButton } from '../../components/auth/AuthSubmitButton';
import { FormAlert } from '../../components/auth/FormAlert';
import { Reveal } from '../../components/ui/Reveal';
import { fieldErrorsFrom, type ApiErrorBody } from '../../lib/apiTypes';
import { resolveAuthDestination, type AuthSuccessBody } from '../../lib/authRouting';

type Intent = 'artist' | 'buyer';

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawIntent = searchParams.get('intent');
  const intent: Intent | null = rawIntent === 'artist' || rawIntent === 'buyer' ? rawIntent : null;

  // No valid intent in the URL — send them through the choice first
  // rather than silently defaulting to one (defaulting is how the old
  // flow ended up with every signup as BUYER with no way to signal
  // otherwise).
  useEffect(() => {
    if (!intent) router.replace('/welcome');
  }, [intent, router]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!intent) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password,
          intent: intent.toUpperCase(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const err = data as ApiErrorBody;
        setFormError(err.message ?? 'Something went wrong. Try again.');
        setFieldErrors(fieldErrorsFrom(err.details));
        return;
      }

      const body = data as AuthSuccessBody;
      router.refresh();
      router.push(resolveAuthDestination(body));
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
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

      <Reveal delay={120}>
        <form onSubmit={handleSubmit} noValidate className="mt-10 flex flex-col gap-5">
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
              onChange={(event) => setFirstName(event.target.value)}
              error={fieldErrors.firstName}
            />
            <AuthField
              id="lastName"
              label="Last name"
              type="text"
              name="lastName"
              autoComplete="family-name"
              required
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              error={fieldErrors.lastName}
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
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
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
              onChange={(event) => setPassword(event.target.value)}
              error={fieldErrors.password}
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
