'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import { useCart } from '@/context/CartContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

export default function CartPage() {
  const { cart, removeFromCart, totalPrice, clearCart } = useCart();
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderComplete, setOrderComplete] = useState<string | null>(null);

  const handleCheckout = async () => {
    setIsProcessing(true);
    try {
      const artworkIds = cart.map((i) => i.id);
      const res = await fetch(`${API_URL}/api/v1/orders/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artworkIds }),
      });

      const json = await res.json();
      if (json.success) {
        setOrderComplete(json.data.orderNumber);
        clearCart();
      }
    } catch (err) {
      console.error('Checkout failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (orderComplete) {
    return (
      <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--foreground))] px-[var(--container-gutter)] py-24 text-center">
        <span className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--accent))] font-medium">
          Order Confirmed
        </span>
        <h1 className="font-['Fraunces'] text-4xl md:text-5xl font-normal mt-2">
          Thank you for your purchase
        </h1>
        <p className="text-[rgb(var(--muted))] mt-4 font-mono text-sm">
          Order Reference: {orderComplete}
        </p>
        <Link
          href={'/orders' as Route}
          className="inline-block mt-8 px-6 py-3 bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] text-sm font-medium rounded-[var(--radius-sm)]"
        >
          View Order History
        </Link>
      </div>
    );
  }

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
          {/* Cart Item List */}
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

          {/* Checkout Summary */}
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
            <button
              onClick={handleCheckout}
              disabled={isProcessing}
              className="w-full py-3 bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] font-medium text-sm rounded transition-opacity disabled:opacity-50"
            >
              {isProcessing ? 'Processing Order...' : 'Proceed to Checkout'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
