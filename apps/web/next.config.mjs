/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  images: {
    remotePatterns: [
      // Cloudinary — your real production image host for artist-uploaded
      // artwork, per the existing upload flow.
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      // picsum.photos — seed/placeholder artwork images used in
      // development data. Safe to remove once real artwork images
      // replace all seeded placeholders.
      { protocol: 'https', hostname: 'picsum.photos' },
    ],
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';
    const backendUrl = apiUrl.endsWith('/api') ? apiUrl.slice(0, -4) : apiUrl;
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
