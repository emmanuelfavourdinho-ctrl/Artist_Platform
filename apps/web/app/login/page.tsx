'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { AuthLayout } from '../../components/auth/AuthLayout';
import { AuthField } from '../../components/auth/AuthField';
import { AuthSubmitButton } from '../../components/auth/AuthSubmitButton';
import { FormAlert } from '../../components/auth/FormAlert';
import { Reveal } from '../../components/ui/Reveal';
import { fieldErrorsFrom, type ApiErrorBody } from '../../lib/apiTypes';
import { resolveAuthDestination, type AuthSuccessBody } from '../../lib/authRouting';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const err = data as ApiErrorBody;
        setFormError(err.message ?? 'Something went wrong. Try again.');
        setFieldErrors(fieldErrorsFrom(err.details));
        return;
      }

      const body = data as AuthSuccessBody;
      router.push(resolveAuthDestination(body));
      router.refresh();
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      image="/images/hero/hero-02.jpg"
      quote="“A creative ecosystem for discovering artists, showcasing work, and turning creativity into opportunity.”"
    >
      <Reveal>
        <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">
          Welcome back
        </p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] text-foreground">
          Sign in to your <span className="italic text-accent">account.</span>
        </h1>
      </Reveal>

      <Reveal delay={120}>
        <form onSubmit={handleSubmit} noValidate className="mt-10 flex flex-col gap-5">
          {formError && <FormAlert message={formError} />}

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

          <AuthField
            id="password"
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
          />

          <div className="mt-2">
            <AuthSubmitButton
              submitting={submitting}
              label="Log in"
              submittingLabel="Logging in…"
            />
          </div>
        </form>
      </Reveal>

      <Reveal delay={200}>
        <p className="mt-8 text-center text-sm text-muted">
          Need an account?{' '}
          <Link href="/welcome" className="font-medium text-accent underline underline-offset-2">
            Create one
          </Link>
        </p>
      </Reveal>
    </AuthLayout>
  );
}
