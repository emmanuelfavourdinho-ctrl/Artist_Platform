'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { createCheckoutSession } from '@/lib/checkoutApi';

export default function CartPage() {
  const router = useRouter();
  const { cart, removeFromCart, totalPrice } = useCart();
  const { appUser, loading: authLoading } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const handleCheckout = async () => {
    setCheckoutError(null);

    // Cart stays guest-friendly (per how this was scoped) — login is
    // only required at this exact step, not to view the cart itself.
    if (!appUser) {
      router.push('/login');
      return;
    }

    setIsProcessing(true);
    try {
      const items = cart.map((item) => ({ artworkId: item.id, quantity: 1 }));
      const checkoutUrl = await createCheckoutSession(items);
      // Full page navigation, not router.push — this goes to Stripe's
      // own domain, not an internal route.
      window.location.href = checkoutUrl;
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'Could not start checkout. Please try again.',
      );
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--foreground))] px-[var(--container-gutter)] py-12">
      <header className="mb-12 border-b border-[rgb(var(--border)/0.12)] pb-8">
        <span className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--accent))] font-medium">
          Acquisitions
        </span>
        <h1 className="font-['Fraunces'] text-4xl md:text-6xl font-normal mt-2 tracking-tight">
          Shopping Cart
        </h1>
      </header>

      {cart.length === 0 ? (
        <div className="text-center py-24 bg-[rgb(var(--surface))] rounded-[var(--radius-lg)] border border-[rgb(var(--border)/0.05)]">
          <p className="font-['Fraunces'] text-xl text-[rgb(var(--muted))]">
            Your cart is currently empty.
          </p>
          <Link
            href="/gallery"
            className="inline-block mt-6 px-6 py-2.5 bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] font-medium text-sm rounded-[var(--radius-sm)]"
          >
            Explore Gallery
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-4">
            {cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-6 p-4 bg-[rgb(var(--surface))] rounded-[var(--radius-md)] border border-[rgb(var(--border)/0.06)]"
              >
                <div className="relative w-20 h-24 rounded bg-[rgb(var(--background))] overflow-hidden flex-shrink-0">
                  <Image src={item.imageUrl} alt={item.title} fill className="object-cover" />
                </div>
                <div className="flex-1">
                  <h3 className="font-['Fraunces'] text-lg">{item.title}</h3>
                  <p className="font-mono text-sm text-[rgb(var(--muted))] mt-1">
                    ${Number(item.price).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="text-xs uppercase text-[rgb(var(--muted))] hover:text-[rgb(var(--foreground))]"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="bg-[rgb(var(--surface))] p-6 rounded-[var(--radius-lg)] border border-[rgb(var(--border)/0.08)] h-fit space-y-6">
            <h2 className="font-['Fraunces'] text-xl border-b border-[rgb(var(--border)/0.1)] pb-4">
              Summary
            </h2>
            <div className="flex justify-between font-mono text-sm">
              <span className="text-[rgb(var(--muted))]">Subtotal</span>
              <span>${totalPrice.toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-mono text-sm">
              <span className="text-[rgb(var(--muted))]">Shipping</span>
              <span>Calculated at checkout</span>
            </div>
            <div className="border-t border-[rgb(var(--border)/0.1)] pt-4 flex justify-between font-semibold text-lg">
              <span>Total</span>
              <span>${totalPrice.toLocaleString()}</span>
            </div>

            {checkoutError && (
              <p role="alert" className="text-sm text-red-500">
                {checkoutError}
              </p>
            )}

            <button
              onClick={handleCheckout}
              disabled={isProcessing || authLoading}
              className="w-full py-3 bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] font-medium text-sm rounded transition-opacity disabled:opacity-50"
            >
              {isProcessing ? 'Redirecting to secure checkout…' : 'Proceed to Checkout'}
            </button>
            {!appUser && !authLoading && (
              <p className="text-xs text-[rgb(var(--muted))] text-center">
                You&apos;ll be asked to log in before payment.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
