import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

export interface InformationSection {
  heading: string;
  body: ReactNode;
}

export function InformationPage({
  eyebrow,
  title,
  intro,
  sections,
  related = [],
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: InformationSection[];
  related?: { label: string; href: Route }[];
}) {
  return (
    <main className="mx-auto min-h-screen max-w-content px-gutter py-16 sm:py-24">
      <header className="max-w-3xl border-b border-foreground/10 pb-12">
        <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">{eyebrow}</p>
        <h1 className="mt-3 font-display text-5xl leading-[1.05] text-foreground">{title}</h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-muted">{intro}</p>
      </header>
      <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_260px]">
        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-2xl text-foreground">{section.heading}</h2>
              <div className="mt-3 text-sm leading-7 text-muted">{section.body}</div>
            </section>
          ))}
        </div>
        {related.length > 0 && (
          <aside className="h-fit border-l border-foreground/10 pl-6">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              Related resources
            </p>
            <nav className="mt-4 flex flex-col gap-3">
              {related.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-accent underline underline-offset-4"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </aside>
        )}
      </div>
    </main>
  );
}
