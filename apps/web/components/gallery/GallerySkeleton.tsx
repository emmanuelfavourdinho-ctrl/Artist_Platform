export function GallerySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="aspect-[4/5] w-full rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="mt-4 h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="mt-2 h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}
