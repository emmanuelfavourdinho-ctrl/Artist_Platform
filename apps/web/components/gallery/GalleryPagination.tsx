import Link from 'next/link';
import type { Pagination } from '../../lib/artworksApi';

interface GalleryPaginationProps {
  pagination: Pagination;
  buildHref: (page: number) => string;
}

export function GalleryPagination({ pagination, buildHref }: GalleryPaginationProps) {
  if (pagination.totalPages <= 1) return null;

  return (
    <nav aria-label="Gallery pagination" className="mt-16 flex items-center justify-center gap-2">
      {Array.from({ length: pagination.totalPages }, (_, index) => index + 1).map((pageNumber) => (
        <Link
          key={pageNumber}
          href={buildHref(pageNumber)}
          aria-current={pageNumber === pagination.page ? 'page' : undefined}
          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors duration-200 ${
            pageNumber === pagination.page
              ? 'bg-foreground text-background'
              : 'text-foreground/70 hover:bg-foreground/10'
          }`}
        >
          {pageNumber}
        </Link>
      ))}
    </nav>
  );
}
