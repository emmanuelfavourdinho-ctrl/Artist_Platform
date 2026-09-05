import Link from 'next/link';
import { InformationPage } from '../../components/content/InformationPage';
export const metadata = { title: 'Report an Issue | Artist_Platform' };
export default function Page() {
  return (
    <InformationPage
      eyebrow="Help"
      title="Tell us what needs attention."
      intro="Report broken functionality, suspicious behavior, content concerns, order issues, commission issues, or messaging problems."
      sections={[
        {
          heading: 'Include useful context',
          body: (
            <>
              Share the route, approximate time, and relevant order or commission reference. Never
              send passwords, Firebase secrets, or private credentials.
            </>
          ),
        },
        {
          heading: 'Send the report',
          body: (
            <>
              Use the existing{' '}
              <Link href="/contact" className="text-accent underline underline-offset-4">
                Contact
              </Link>{' '}
              page so the issue reaches the platform support channel.
            </>
          ),
        },
      ]}
    />
  );
}
