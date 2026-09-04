'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { AuthLayout } from '../../components/auth/AuthLayout';
import { AuthField } from '../../components/auth/AuthField';
import { AuthSubmitButton } from '../../components/auth/AuthSubmitButton';
import { FormAlert } from '../../components/auth/FormAlert';
import { Reveal } from '../../components/ui/Reveal';
import { resolveAuthDestination } from '../../lib/authRouting';
import { loginWithEmail, loginWithGoogle, mapFirebaseError } from '../../lib/authClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const body = await loginWithEmail(email, password);
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
      const body = await loginWithGoogle();
      router.push(resolveAuthDestination(body));
      router.refresh();
    } catch (err) {
      setFormError(mapFirebaseError(err));
    } finally {
      setGoogleSubmitting(false);
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

          <div className="-mt-2 text-right text-sm">
            <Link
              href="/forgot-password"
              className="font-medium text-accent underline underline-offset-2"
            >
              Forgot your password?
            </Link>
          </div>

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
