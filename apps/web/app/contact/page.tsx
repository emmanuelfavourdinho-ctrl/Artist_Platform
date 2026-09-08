'use client';

import { useState } from 'react';
import emailjs from '@emailjs/browser';
import { Reveal } from '../../components/ui/Reveal';
import { AuthField } from '../../components/auth/AuthField';
import { AuthSubmitButton } from '../../components/auth/AuthSubmitButton';
import { submitContactMessage, reportEmailOutcome } from '../../lib/contactApi';

const EMAILJS_SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID ?? '';
const EMAILJS_TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID ?? '';
const EMAILJS_PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY ?? '';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    let messageId: string;
    try {
      // Source of truth first: the message is not "sent" from the
      // user's point of view until it's safely in the database. If
      // this throws, we stop here — nothing was lost, and the person
      // sees a real error with their text still in the form.
      messageId = await submitContactMessage({ name, email, subject, message });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }

    // From here on, the message is already safely stored — EmailJS is
    // purely a best-effort notification layer on top of that. Its
    // success or failure must never change what the person sees next.
    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        { from_name: name, from_email: email, subject, message },
        { publicKey: EMAILJS_PUBLIC_KEY },
      );
      void reportEmailOutcome(messageId, true);
    } catch (err) {
      void reportEmailOutcome(
        messageId,
        false,
        err instanceof Error ? err.message : 'Unknown error',
      );
    }

    setSubmitting(false);
    setSubmitted(true);
    setName('');
    setEmail('');
    setSubject('');
    setMessage('');
  }

  return (
    <main className="mx-auto max-w-content px-gutter py-20 md:py-32">
      <Reveal>
        <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">
          Get in Touch
        </p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Start a <span className="italic text-accent">conversation.</span>
        </h1>
      </Reveal>

      <div className="mt-12 max-w-xl">
        {submitted ? (
          <Reveal>
            <div className="rounded-lg border border-accent/30 bg-accent/10 p-6 text-foreground">
              <h3 className="font-display text-lg text-accent">Message Sent</h3>
              <p className="mt-2 text-sm text-foreground/80">
                Thank you for reaching out. Our support team will get back to you shortly.
              </p>
            </div>
          </Reveal>
        ) : (
          <Reveal delay={100}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {formError && (
                <div
                  role="alert"
                  className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500"
                >
                  {formError}
                </div>
              )}

              <AuthField
                id="name"
                label="Full Name"
                type="text"
                name="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <AuthField
                id="email"
                label="Email Address"
                type="email"
                name="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <AuthField
                id="subject"
                label="Subject"
                type="text"
                name="subject"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="message"
                  className="text-[13px] font-medium uppercase tracking-[0.12em] text-foreground/80"
                >
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={5}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="rounded-md border border-foreground/20 bg-background px-4 py-3 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </div>
              <AuthSubmitButton
                submitting={submitting}
                label="Send Message"
                submittingLabel="Sending..."
              />
            </form>
          </Reveal>
        )}
      </div>
    </main>
  );
}
