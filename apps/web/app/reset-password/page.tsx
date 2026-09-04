'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { AuthLayout } from '../../components/auth/AuthLayout';
import { AuthField } from '../../components/auth/AuthField';
import { AuthSubmitButton } from '../../components/auth/AuthSubmitButton';
import { FormAlert } from '../../components/auth/FormAlert';
import { Reveal } from '../../components/ui/Reveal';
import { confirmReset, mapFirebaseError } from '../../lib/authClient';

function ResetPasswordPageContent() {
  const searchParams = useSearchParams();
  // Firebase puts this in the reset-link URL automatically — nothing
  // to build ourselves, we just read it out.
  const oobCode = searchParams.get('oobCode');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!oobCode) {
      setFormError('This reset link is invalid or has expired. Please request a new one.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmReset(oobCode, password);
      setDone(true);
    } catch (err) {
      setFormError(mapFirebaseError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout image="/images/hero/hero-05.jpg" quote="“A fresh start, securely.”">
      <Reveal>
        <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">
          Account recovery
        </p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] text-foreground">
          Create a new <span className="italic text-accent">password.</span>
        </h1>
      </Reveal>

      <Reveal delay={120}>
        {done ? (
          <div className="mt-10 rounded-lg border border-foreground/10 p-6 text-sm text-foreground">
            Your password has been reset.{' '}
            <Link href="/login" className="font-medium text-accent underline underline-offset-2">
              Return to sign in
            </Link>
            .
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-10 flex flex-col gap-5">
            {formError && <FormAlert message={formError} />}
            <AuthField
              id="password"
              label="New password"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <AuthField
              id="confirmPassword"
              label="Confirm new password"
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <div className="mt-2">
              <AuthSubmitButton
                submitting={submitting}
                label="Reset password"
                submittingLabel="Resetting…"
              />
            </div>
          </form>
        )}
      </Reveal>
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
