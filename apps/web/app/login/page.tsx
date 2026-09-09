'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { AuthLayout } from '../../components/auth/AuthLayout';
import { AuthField } from '../../components/auth/AuthField';
import { AuthSubmitButton } from '../../components/auth/AuthSubmitButton';
import { AuthDivider } from '../../components/auth/AuthDivider';
import { FormAlert } from '../../components/auth/FormAlert';
import { GoogleAuthButton } from '../../components/auth/GoogleAuthButton';
import { PasswordField } from '../../components/auth/PasswordField';
import { Reveal } from '../../components/ui/Reveal';
import { loginWithEmail, loginWithGoogle } from '../../lib/authClient';
import { useAuthForm } from '../../lib/useAuthForm';

function LoginPageContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const redirectTo = useSearchParams().get('redirect');

  const { error, emailPending, googlePending, anyPending, runEmail, runGoogle } =
    useAuthForm(redirectTo);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runEmail(() => loginWithEmail(email, password));
  }

  function handleGoogle() {
    void runGoogle(() => loginWithGoogle());
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
        <div role="alert" aria-live="assertive" className="mt-10">
          {error && <FormAlert message={error} />}
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <fieldset disabled={googlePending} className="contents border-0 p-0 m-0">
            <AuthField
              id="email"
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <div>
              <PasswordField
                id="password"
                label="Password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {/* Industry-standard placement: directly under the password
                  field, not between email and password — this is where
                  Google, GitHub, and most SaaS logins put it, since the
                  person's attention is already on the password at the
                  exact moment they'd realize they've forgotten it. */}
              <div className="mt-1.5 text-right text-sm">
                <Link
                  href="/forgot-password"
                  className="font-medium text-accent underline underline-offset-2"
                >
                  Forgot your password?
                </Link>
              </div>
            </div>

            <div className="mt-2">
              <AuthSubmitButton
                submitting={emailPending}
                label="Log in"
                submittingLabel="Logging in…"
              />
            </div>
          </fieldset>
        </form>

        <AuthDivider />
        <GoogleAuthButton onClick={handleGoogle} loading={googlePending} disabled={anyPending} />
      </Reveal>

      <Reveal delay={200}>
        <p className="mt-8 text-center text-sm text-muted">
          Need an account?{' '}
          <Link
            href={
              redirectTo
                ? (`/welcome?redirect=${encodeURIComponent(redirectTo)}` as any)
                : '/welcome'
            }
            className="font-medium text-accent underline underline-offset-2"
          >
            Create one
          </Link>
        </p>
      </Reveal>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
