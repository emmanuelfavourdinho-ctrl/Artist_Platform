import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16 sm:px-8">
        <div className="space-y-8 text-center">
          <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Artist Marketplace</p>
          <h1 className="text-4xl font-semibold sm:text-5xl lg:text-6xl">
            Foundation for a performance-first art marketplace.
          </h1>
          <p className="mx-auto max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
            A clean, scalable starter architecture for Next.js, Express, PostgreSQL, Redis, and
            object storage. This setup prioritizes SEO, image performance, and a predictable REST
            API.
          </p>
          <div className="mx-auto flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              Explore the frontend
            </Link>
            <Link
              href="/"
              className="rounded-full border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:border-slate-500"
            >
              View architecture notes
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
