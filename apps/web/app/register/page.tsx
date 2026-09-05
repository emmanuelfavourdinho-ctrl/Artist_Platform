'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { AuthLayout } from '../../components/auth/AuthLayout';
import { AuthField } from '../../components/auth/AuthField';
import { AuthSubmitButton } from '../../components/auth/AuthSubmitButton';
import { AuthDivider } from '../../components/auth/AuthDivider';
import { FormAlert } from '../../components/auth/FormAlert';
import { GoogleAuthButton } from '../../components/auth/GoogleAuthButton';
import { PasswordField } from '../../components/auth/PasswordField';
import { Reveal } from '../../components/ui/Reveal';
import { registerWithEmail, loginWithGoogle } from '../../lib/authClient';
import { parseSignupIntent, toBackendIntent } from '../../lib/authIntent';
import { useAuthForm } from '../../lib/useAuthForm';

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intent = parseSignupIntent(searchParams.get('intent'));

  useEffect(() => {
    if (!intent) router.replace('/welcome');
  }, [intent, router]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { error, emailPending, googlePending, anyPending, runEmail, runGoogle } = useAuthForm();

  if (!intent) return null;

  const backendIntent = toBackendIntent(intent);
  const isArtist = intent === 'artist';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // registerWithEmail now ONLY talks to Firebase (creates the
    // account, sets the display name) and no longer takes `intent` —
    // that's passed separately below, as the `extra` argument to
    // runEmail, so it can be forwarded to the ONE sync call that
    // actually needs it (see useAuthForm.ts).
    void runEmail(() => registerWithEmail({ email, password, firstName, lastName }), {
      intent: backendIntent,
      firstName,
      lastName,
    });
  }

  function handleGoogle() {
    void runGoogle(() => loginWithGoogle(), { intent: backendIntent });
  }

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
        <div role="alert" aria-live="assertive" className="mt-10">
          {error && <FormAlert message={error} />}
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          {/* Primary path first: the form people came here to fill out.
              Google is a secondary, faster alternative — shown after,
              not competing for the first thing someone sees. This
              matches the pattern most people already know from other
              platforms (form on top, "or continue with X" below it),
              so nothing here needs re-learning. */}
          <fieldset disabled={googlePending} className="contents border-0 p-0 m-0">
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
              <PasswordField
                id="password"
                label="Password"
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
                submitting={emailPending}
                label="Create account"
                submittingLabel="Creating account…"
              />
            </div>
          </fieldset>
        </form>

        <AuthDivider />
        <GoogleAuthButton onClick={handleGoogle} loading={googlePending} disabled={anyPending} />
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

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageContent />
    </Suspense>
  );
}
