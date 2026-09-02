'use client';

import { useState } from 'react';
import { Reveal } from '../../components/ui/Reveal';
import { AuthField } from '../../components/auth/AuthField';
import { AuthSubmitButton } from '../../components/auth/AuthSubmitButton';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    // Simulate API request
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSubmitting(false);
    setSubmitted(true);
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
              <AuthField id="name" label="Full Name" type="text" name="name" required />
              <AuthField id="email" label="Email Address" type="email" name="email" required />
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
