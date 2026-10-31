import Link from 'next/link';
import { InformationPage } from '../../components/content/InformationPage';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { getCommissionStatusMeta, type CommissionStatus } from '../../lib/commissionStatus';

export const metadata = {
  title: 'Commissions | Artist_Platform',
  description:
    'Request custom artwork from an artist: how commissions work, what to include, and what each status means.',
};

// Labels and colours come from lib/commissionStatus.ts so this page cannot
// drift from the statuses buyers see in their account. Only the plain-language
// meaning is written here.
const STATUS_GUIDE: { status: CommissionStatus; meaning: string }[] = [
  { status: 'SUBMITTED', meaning: 'Your request has been sent and is waiting for the artist.' },
  { status: 'REVIEWING', meaning: 'The artist is reading your brief and deciding.' },
  { status: 'ACCEPTED', meaning: 'The artist has agreed to take on the commission.' },
  { status: 'IN_PROGRESS', meaning: 'The artist has started work.' },
  { status: 'COMPLETED', meaning: 'The work is finished.' },
  {
    status: 'REJECTED',
    meaning: 'The artist cannot take this request. You are free to ask another artist.',
  },
  { status: 'CANCELLED', meaning: 'The request was cancelled and no work will happen.' },
];

const linkClass = 'text-accent underline underline-offset-2';

export default function Page() {
  return (
    <InformationPage
      eyebrow="Custom artwork"
      title="Ask an artist to make something just for you."
      intro="A commission is a request for a new piece, made to one artist, to your brief. It is separate from buying artwork that already exists."
      sections={[
        {
          heading: 'How it works',
          body: (
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                <strong className="text-foreground">Choose an artist.</strong> Browse the{' '}
                <Link href="/gallery" className={linkClass}>
                  gallery
                </Link>
                , open an artist&apos;s profile, and start your request from there. Each request
                goes to one artist.
              </li>
              <li>
                <strong className="text-foreground">Describe what you want.</strong> A short guided
                form asks for a project title and a description of the work. Category, budget,
                preferred deadline and reference images are optional. You need an account to send a
                request.
              </li>
              <li>
                <strong className="text-foreground">The artist responds.</strong> They read your
                brief and accept or decline it. You can follow the status from your{' '}
                <Link href="/account" className={linkClass}>
                  account
                </Link>
                .
              </li>
              <li>
                <strong className="text-foreground">Talk it through.</strong> Questions, references
                and timing are discussed in the conversation attached to your request, in{' '}
                <Link href="/messages" className={linkClass}>
                  Messages
                </Link>
                .
              </li>
              <li>
                <strong className="text-foreground">Work and delivery.</strong> If accepted, the
                request moves to In progress and then Completed.
              </li>
            </ol>
          ),
        },
        {
          heading: 'What to include in your request',
          body: (
            <>
              <p>The clearer the brief, the easier it is for an artist to say yes.</p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>What you want made, and what it is for (a gift, a room, a project).</li>
                <li>Size, medium or style if you have a preference.</li>
                <li>Reference images that show the mood, colours or composition you like.</li>
                <li>A budget you are comfortable with. It helps the artist judge the scope.</li>
                <li>A preferred deadline, if timing matters. It is a preference, not a promise.</li>
              </ul>
            </>
          ),
        },
        {
          heading: 'What each status means',
          body: (
            <ul className="space-y-3">
              {STATUS_GUIDE.map(({ status, meaning }) => {
                const { label, tone } = getCommissionStatusMeta(status);
                return (
                  <li key={status} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="w-44 shrink-0">
                      <StatusBadge tone={tone} label={label} />
                    </span>
                    <span>{meaning}</span>
                  </li>
                );
              })}
            </ul>
          ),
        },
        {
          heading: 'Price, payment and delivery',
          body: (
            <>
              <p>
                Commissions are new on Fine Arts, and we are building them step by step. Payment for
                custom work is not processed through the platform yet, so agree the price, timeline
                and how the finished piece will reach you with the artist in your conversation
                before work begins.
              </p>
              <p className="mt-3">
                Buying a finished artwork from the gallery is different: those purchases go through
                checkout and are covered by{' '}
                <Link href="/buyer-protection" className={linkClass}>
                  buyer protection
                </Link>
                .
              </p>
            </>
          ),
        },
        {
          heading: 'Keep everything in one place',
          body: (
            <p>
              Your request, its status and your messages with the artist are linked together, so you
              can always see where things stand. Keeping the conversation on the platform also means
              you have a record if anything needs to be checked later.
            </p>
          ),
        },
        {
          heading: 'For artists',
          body: (
            <p>
              Incoming requests appear in your Studio, where you can review the brief and respond.
              New to the platform?{' '}
              <Link href="/sell-your-art" className={linkClass}>
                Learn how to sell your art
              </Link>
              .
            </p>
          ),
        },
        {
          heading: 'Ready to start?',
          body: (
            <div className="flex flex-wrap gap-3">
              <Link
                href="/gallery"
                className="inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground"
              >
                Find an artist
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex min-h-11 items-center rounded-md border border-border/20 px-5 text-sm font-medium text-foreground hover:border-accent"
              >
                How Fine Arts works
              </Link>
            </div>
          ),
        },
      ]}
    />
  );
}
