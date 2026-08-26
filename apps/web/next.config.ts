import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      // Cloudinary doesn't need an entry here — CoverImage.tsx uses a
      // per-image custom loader for res.cloudinary.com URLs, which
      // bypasses this allow-list entirely (see lib/cloudinaryLoader.ts).
    ],
  },
};

export default nextConfig;
