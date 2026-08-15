import Link from 'next/link';

const COLUMNS: { heading: string; links: string[] }[] = [
  { heading: 'Platform', links: ['Discover', 'Artists', 'Marketplace', 'Community'] },
  { heading: 'Company', links: ['About', 'Contact'] },
  { heading: 'Legal', links: ['Privacy', 'Terms'] },
];

export function Footer() {
  return (
    <footer className="border-t border-foreground/10 bg-background">
      <div className="mx-auto max-w-content px-gutter py-16">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <p className="font-display text-lg tracking-[0.08em] text-foreground">
              ARTIST<span className="text-accent">_</span>PLATFORM
            </p>
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted">
              A creative home for artists to showcase work, find opportunity, and build an
              audience that lasts.
            </p>
            <div className="mt-6 flex gap-4">
              <Link
                href="/"
                aria-label="Artist_Platform on Instagram"
                className="text-sm text-muted transition-colors hover:text-foreground"
              >
                Instagram
              </Link>
              <Link
                href="/"
                aria-label="Artist_Platform on X"
                className="text-sm text-muted transition-colors hover:text-foreground"
              >
                X
              </Link>
            </div>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted">
                {column.heading}
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link}>
                    <Link
                      href="/"
                      className="text-sm text-foreground/80 transition-colors hover:text-foreground"
                    >
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-foreground/10 pt-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Artist_Platform. All rights reserved.</p>
          <p>Made for people who make things.</p>
        </div>
      </div>
    </footer>
  );
}
