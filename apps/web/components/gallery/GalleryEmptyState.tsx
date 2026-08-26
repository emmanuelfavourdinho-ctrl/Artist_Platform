export function GalleryEmptyState() {
  return (
    <div className="mt-20 flex flex-col items-center py-24 text-center">
      <p className="font-display text-2xl text-foreground">The collection is taking shape.</p>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
        New works will appear here as artists publish their pieces. Check back soon.
      </p>
    </div>
  );
}
