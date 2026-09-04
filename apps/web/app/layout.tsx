import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';

export const metadata: Metadata = {
  title: 'Artist_Platform - Where creativity finds its audience',
  description:
    'A creative ecosystem for discovering artists, showcasing work, building connections, and turning creativity into opportunity.',
  openGraph: {
    title: 'Artist_Platform - Where creativity finds its audience',
    description:
      'A creative ecosystem for discovering artists, showcasing work, building connections, and turning creativity into opportunity.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body">
        <AuthProvider>
          <CartProvider>{children}</CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
