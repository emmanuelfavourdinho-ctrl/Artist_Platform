'use client';

import Link from 'next/link';

export default function CheckoutSuccessPage() {
  return (
    <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--foreground))] px-[var(--container-gutter)] py-24 text-center">
      <span className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--accent))] font-medium">
        Confirming payment
      </span>
      <h1 className="font-['Fraunces'] text-4xl md:text-5xl font-normal mt-2">
        Your checkout is being confirmed
      </h1>
      <p className="text-[rgb(var(--muted))] mt-4 font-mono text-sm max-w-md mx-auto">
        We are waiting for the payment confirmation. Your order history will update once confirmation is complete.
      </p>
      <Link
        href="/orders"
        className="inline-block mt-8 px-6 py-3 bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] text-sm font-medium rounded-[var(--radius-sm)]"
      >
        View Order History
      </Link>
    </div>
  );
}
