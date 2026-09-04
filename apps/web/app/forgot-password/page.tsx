'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';

import { AuthLayout } from '../../components/auth/AuthLayout';
import { AuthField } from '../../components/auth/AuthField';
import { AuthSubmitButton } from '../../components/auth/AuthSubmitButton';
import { Reveal } from '../../components/ui/Reveal';
import { sendResetEmail } from '../../lib/authClient';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await sendResetEmail(email);
    } catch {
      // Deliberately swallowed — per spec §14, never reveal whether an
      // email exists in the system. Same success message either way.
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  return (
    <AuthLayout image="/images/hero/hero-03.jpg" quote="“Every account deserves a way back in.”">
      <Reveal>
        <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">
          Account recovery
        </p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] text-foreground">
          Forgot your <span className="italic text-accent">password?</span>
        </h1>
        <p className="mt-3 text-sm text-muted">
          Enter the email address associated with your account and we&apos;ll send you a password
          reset link.
        </p>
      </Reveal>

      <Reveal delay={120}>
        {sent ? (
          <div className="mt-10 rounded-lg border border-foreground/10 p-6 text-sm text-foreground">
            If an account exists for that email, a reset link is on its way. Check your inbox (and
            spam folder).
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-10 flex flex-col gap-5">
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
            <div className="mt-2">
              <AuthSubmitButton
                submitting={submitting}
                label="Send reset link"
                submittingLabel="Sending…"
              />
            </div>
          </form>
        )}
      </Reveal>

      <Reveal delay={200}>
        <p className="mt-8 text-center text-sm text-muted">
          <Link href="/login" className="font-medium text-accent underline underline-offset-2">
            Back to sign in
          </Link>
        </p>
      </Reveal>
    </AuthLayout>
  );
}
