import './globals.css';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import { PwaRuntime } from '../components/pwa/PwaRuntime';

export const metadata: Metadata = {
  applicationName: 'Fine Arts',
  title: 'Fine Arts - Where creativity finds its audience',
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

export const viewport: Viewport = {
  themeColor: '#0B0B0C',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body">
        <AuthProvider>
          <PwaRuntime />
          <CartProvider>{children}</CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
