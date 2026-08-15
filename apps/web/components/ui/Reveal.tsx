'use client';

import type { CSSProperties, ReactNode } from 'react';

import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';

type RevealProps = {
  children: ReactNode;
  /** Optional delay in ms, used to stagger a group of children. */
  delay?: number;
  className?: string;
};

/*
  Explainer: this is a small invisible box that watches itself. As soon
  as it scrolls into view, it fades its contents in and nudges them up
  slightly — like a slide arriving on stage rather than just popping in.
  Wrap anything in <Reveal> and it gets that entrance for free.
*/
export function Reveal({ children, delay = 0, className = '' }: RevealProps) {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={`${visible ? 'animate-reveal-up' : ''} ${className}`}
      style={{
        opacity: visible ? 1 : 0,
        '--reveal-delay': `${delay}ms`,
      } as CSSProperties}
    >
      {children}
    </div>
  );
}
