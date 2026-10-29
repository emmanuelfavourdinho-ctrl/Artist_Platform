import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Fine Arts',
    short_name: 'Fine Arts',
    description: 'Discover artists, share creative work, and connect through Fine Arts.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0B0B0C',
    theme_color: '#0B0B0C',
    icons: [
      { src: '/icons/fine-arts-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/fine-arts-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
