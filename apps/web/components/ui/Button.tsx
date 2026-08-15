import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary';

type ButtonProps<T extends string> = {
  href: Route<T> | Route;
  variant?: ButtonVariant;
  children: ReactNode;
};

/*
  Explainer: rather than re-typing button styles on every page, this
  component is the one true definition of "what a button looks like on
  Artist_Platform". `variant="primary"` is the solid gold button (the
  main action we want people to take); `variant="secondary"` is the
  quieter outlined button.
*/
export function Button<T extends string>({ href, variant = 'primary', children }: ButtonProps<T>) {
  const base =
    'group inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-sm font-medium tracking-wide transition-all duration-300 ease-cinematic focus-visible:outline-2';

  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-accent text-accent-foreground hover:bg-foreground',
    secondary:
      'border border-foreground/25 text-foreground hover:border-foreground/70 hover:bg-foreground/5',
  };

  return (
    <Link href={href} className={`${base} ${styles[variant]}`}>
      {children}
      <span aria-hidden="true" className="transition-transform duration-300 ease-cinematic group-hover:translate-x-1">
        →
      </span>
    </Link>
  );
}
