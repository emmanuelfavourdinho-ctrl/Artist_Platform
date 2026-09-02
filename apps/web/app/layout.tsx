import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CartProvider } from '@/context/CartContext';

export const metadata: Metadata = {
  title: 'FineArts — Where creativity finds its audience',
  description:
    'A creative ecosystem for discovering artists, showcasing work, building connections, and turning creativity into opportunity.',
  openGraph: {
    title: 'FineArts — Where creativity finds its audience',
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
    <html lang="en" data-scroll-behavior="smooth">
      <body className="font-body">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
