interface CloudinaryLoaderProps {
  src: string;
  width: number;
  quality?: number;
}

const UPLOAD_MARKER = '/upload/';

/*
  Explainer: Cloudinary URLs look like
  https://res.cloudinary.com/<cloud>/image/upload/v169.../artworks/foo.jpg
  — everything between "/upload/" and the rest is where transformation
  params go. This inserts f_auto (best format for the requesting
  browser: webp/avif/etc automatically), q_auto (Cloudinary picks the
  best quality/size tradeoff), c_limit (never upscale past the source),
  and w_<width> (the exact width Next asked for, based on the `sizes`
  prop on the <Image>). Cloudinary generates and caches that exact
  variant on first request — we never re-encode it ourselves.

  This is passed as a per-image `loader` prop (see CoverImage.tsx), NOT
  registered globally in next.config — a global loader would also
  intercept local /public images, which aren't on Cloudinary at all and
  should keep using Next's own built-in optimizer.
*/
export function cloudinaryLoader({ src, width, quality }: CloudinaryLoaderProps): string {
  if (!src.includes('res.cloudinary.com')) {
    // Defensive fallback: if this ever gets called with a non-Cloudinary
    // URL, return it unchanged rather than producing a broken URL.
    return src;
  }

  const markerIndex = src.indexOf(UPLOAD_MARKER);
  if (markerIndex === -1) return src;

  const insertAt = markerIndex + UPLOAD_MARKER.length;
  const transformation = `f_auto,q_${quality ?? 'auto'},c_limit,w_${width}/`;

  return src.slice(0, insertAt) + transformation + src.slice(insertAt);
}
