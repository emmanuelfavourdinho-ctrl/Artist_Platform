import Link from 'next/link';

import { categories } from '../../data/categories';
import { CoverImage } from '../ui/CoverImage';
import { Reveal } from '../ui/Reveal';

export function CreativeCategories() {
  return (
    <section aria-labelledby="categories-heading" className="bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-content px-gutter">
        <Reveal>
          <h2
            id="categories-heading"
            className="max-w-xl font-display text-4xl leading-[1.1] text-foreground sm:text-5xl"
          >
            Every discipline
            <br />
            has a <span className="italic text-accent">home here.</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-2 gap-4 md:grid-cols-3">
          {categories.map((category, index) => (
            <Reveal key={category.id} delay={index * 60}>
              <Link
                href="/"
                className="group relative block aspect-[4/3] overflow-hidden rounded-md focus-visible:outline-2"
              >
                <div className="h-full w-full opacity-70 transition-all duration-500 ease-cinematic group-hover:scale-105 group-hover:opacity-100">
                  <CoverImage
                    src={category.image}
                    alt={category.imageAlt}
                    sizes="(min-width: 768px) 33vw, 50vw"
                    className="h-full w-full"
                  />
                </div>
                <div className="absolute inset-0 bg-background/55 transition-colors duration-500 group-hover:bg-background/30" />

                <div className="absolute inset-0 flex flex-col justify-end p-5">
                  <p className="font-display text-xl text-foreground transition-transform duration-500 ease-cinematic group-hover:-translate-y-1">
                    {category.name}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-foreground/60">
                    {category.count.toLocaleString('en-US')} works
                  </p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
