import Link from 'next/link';
import type { Route } from 'next';

// Paste the EMMATECH LinkedIn page URL here (for example
// 'https://www.linkedin.com/company/your-page'). While this is empty the
// footer shows plain "EMMATECH" text, so there is never a broken link.
const EMMATECH_LINKEDIN_URL =
  'https://www.linkedin.com/in/nsok-emmanuel-72b2683a3?utm_source=share_via&utm_content=profile&utm_medium=member_android';

interface FooterLink {
  label: string;
  href: Route;
}

const INFO_LINKS = {
  Buying: [
    ['How It Works', '/how-it-works'],
    ['Payments', '/payments'],
    ['Shipping & Delivery', '/shipping-delivery'],
    ['Returns / Refunds', '/returns-refunds'],
    ['Buyer Protection', '/buyer-protection'],
  ],
  Selling: [
    ['Sell Your Art', '/sell-your-art'],
    ['Artist Guidelines', '/artist-guidelines'],
    ['Artist Verification', '/artist-verification'],
    ['Commissions', '/commissions'],
    ['Payouts', '/payouts'],
  ],
  Help: [
    ['FAQ', '/faq'],
    ['Contact', '/contact'],
    ['Report an Issue', '/report-issue'],
  ],
} as const;

const COLUMNS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: 'Platform',
    links: [
      { label: 'Discover', href: '/gallery' },
      { label: 'Artists', href: '/' },
      { label: 'Marketplace', href: '/gallery' },
      { label: 'Community', href: '/' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
];

function FooterColumn({ heading, links }: { heading: string; links: FooterLink[] }) {
  return (
    <div>
      <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted">{heading}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-sm text-foreground/80 transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-foreground/10 bg-background">
      <div className="mx-auto max-w-content px-gutter py-16">
        {/* Phones: the brand block spans the full width, then the six link
            groups flow two per row (Platform|Company, Legal|Buying,
            Selling|Help). The two wrappers below use `contents` on phones so
            their children join this grid. From `sm` up the wrappers become
            their own grids again, so tablet and desktop are unchanged:
            row 1 = brand + Platform/Company/Legal, row 2 = Buying/Selling/Help. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:block">
          <div className="contents sm:grid sm:grid-cols-2 sm:gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="col-span-2 sm:col-span-1">
              <p className="font-display text-lg tracking-[0.08em] text-foreground">
                Fine<span className="text-accent">_</span>Arts
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
              <FooterColumn key={column.heading} heading={column.heading} links={column.links} />
            ))}
          </div>

          <div className="contents sm:mt-12 sm:grid sm:grid-cols-3 sm:gap-10 sm:border-t sm:border-foreground/10 sm:pt-12">
            {Object.entries(INFO_LINKS).map(([heading, links]) => (
              <FooterColumn
                key={heading}
                heading={heading}
                links={links.map(([label, href]) => ({ label, href: href as Route }))}
              />
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-foreground/10 pt-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Fine Arts. All rights reserved.</p>
          <p>Made for people who make things.</p>
          <p>
            Powered by{' '}
            {EMMATECH_LINKEDIN_URL ? (
              <a
                href={EMMATECH_LINKEDIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="EMMATECH on LinkedIn (opens in a new tab)"
                className="underline underline-offset-2 transition-colors hover:text-foreground"
              >
                EMMATECH
              </a>
            ) : (
              'EMMATECH'
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
