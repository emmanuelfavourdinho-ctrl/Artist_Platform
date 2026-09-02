import { Reveal } from '../../components/ui/Reveal';

export const metadata = {
  title: 'Terms of Service | Artist_Platform',
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-content px-gutter py-20 md:py-32">
      <Reveal>
        <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">Legal</p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] text-foreground">
          Terms of <span className="italic text-accent">Service.</span>
        </h1>
        <p className="mt-2 text-xs text-muted">Last updated: September 1, 2026</p>
      </Reveal>

      <div className="mt-12 space-y-10 text-foreground/80 leading-relaxed max-w-3xl">
        <section>
          <h2 className="font-display text-xl text-foreground mb-3">1. Account Terms</h2>
          <p>
            Users must provide accurate credentials during registration. You are responsible for
            safeguarding your account access and all activities performed under your profile.
          </p>
          <p>
            Any misuse of the platform or violation of these terms may result in account suspension
            or termination.
          </p>
          <p>
            Any transaction conducted through the platform is subject to these terms and applicable
            laws. And if a transaction violates these terms, the platform may take appropriate
            action.
          </p>
          <p>
            ALL Parties involved in the buying or selling of artwork are solely responsible for any
            transaction performed outta the platform. As the platform is not a party to these
            transactions, it cannot be held liable for any disputes or issues that may arise.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground mb-3">
            2. Artist & Artwork Guidelines
          </h2>
          <p>
            Artists selling or showcasing work on the platform guarantee original ownership or
            explicit distribution authorization for all published material.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground mb-3">3. Termination</h2>
          <p>
            We reserve the right to suspend or terminate accounts that breach platform community
            guidelines, commit copyright infringement, or conduct unauthorized activity.
          </p>
        </section>
      </div>
    </main>
  );
}
