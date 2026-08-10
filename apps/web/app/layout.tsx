import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Artist Marketplace',
  description: 'A modern foundation for an artist art-selling marketplace.',
  openGraph: {
    title: 'Artist Marketplace',
    description: 'A modern foundation for an artist art-selling marketplace.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {' '}
      <body>{children}</body>{' '}
    </html>
  );
}
