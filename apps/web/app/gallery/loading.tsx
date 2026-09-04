const shimmer =
  'animate-shimmer bg-gradient-to-r from-surface via-surface-raised to-surface bg-[length:200%_100%]';

export default function GalleryLoading() {
  return (
    <main className="mx-auto max-w-content px-gutter py-16 sm:py-24">
      <div className={`h-11 w-64 rounded-md ${shimmer}`} />
      <div className={`mt-4 h-5 w-80 rounded-md ${shimmer}`} />

      <div className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className={`aspect-[4/5] rounded-md ${shimmer}`} />
        ))}
      </div>
    </main>
  );
}
