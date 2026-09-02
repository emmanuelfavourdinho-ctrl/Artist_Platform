import { Reveal } from '../../components/ui/Reveal';

export const metadata = {
  title: 'Privacy Policy | Artist_Platform',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-content px-gutter py-20 md:py-32">
      <Reveal>
        <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-accent">Legal</p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] text-foreground">
          Privacy <span className="italic text-accent">Policy.</span>
        </h1>
        <p className="mt-2 text-xs text-muted">Last updated: September 1, 2026</p>
      </Reveal>

      <div className="mt-12 space-y-10 text-foreground/80 leading-relaxed max-w-3xl">
        <section>
          <h2 className="font-display text-xl text-foreground mb-3">1. Information Collection</h2>
          <p>
            We collect information required to deliver our platform services, including your name,
            email address, transaction history, and account session tokens when you register or log
            in.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground mb-3">2. Data Usage</h2>
          <p>
            Your data is strictly utilized to enable account access, manage buyer/artist role
            permissions, process artwork inquiries, and enhance site security.
          </p>
        </section>
      </div>
    </main>
  );
}
