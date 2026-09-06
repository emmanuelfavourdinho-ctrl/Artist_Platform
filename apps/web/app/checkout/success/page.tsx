'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';

export default function CheckoutSuccessPage() {
  const { clearCart } = useCart();
  const [, setCleared] = useState(false);

  useEffect(() => {
    // Stripe only redirects here after a successful payment. The real
    // Order record is created separately, server-side, by the Stripe
    // webhook — this page never creates or confirms anything itself,
    // it just reflects a payment that already succeeded on Stripe's end.
    clearCart();
    setCleared(true);
  }, []);

  return (
    <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--foreground))] px-[var(--container-gutter)] py-24 text-center">
      <span className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--accent))] font-medium">
        Payment received
      </span>
      <h1 className="font-['Fraunces'] text-4xl md:text-5xl font-normal mt-2">
        Thank you for your purchase
      </h1>
      <p className="text-[rgb(var(--muted))] mt-4 font-mono text-sm max-w-md mx-auto">
        Your order is being confirmed and will appear in your order history shortly.
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
