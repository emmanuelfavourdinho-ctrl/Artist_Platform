import { InformationPage } from '../../components/content/InformationPage';
export const metadata = { title: 'FAQ | Artist_Platform' };
export default function Page() {
  return (
    <InformationPage
      eyebrow="Help"
      title="Answers for the marketplace journey."
      intro="Start here for the most common account, buying, artist, messaging, and commission questions."
      sections={[
        {
          heading: 'Account',
          body: (
            <>
              Use Forgot password on sign in to receive a secure Firebase reset link. Choose Buy
              Artwork or Sell Artwork when creating a new account.
            </>
          ),
        },
        {
          heading: 'Buying and selling',
          body: (
            <>
              Browse without signing in. Buyers need an account for private activity and messaging;
              artists complete onboarding before using Studio.
            </>
          ),
        },
        {
          heading: 'Messaging',
          body: (
            <>
              Messages require authentication and should remain contextual to the artist, artwork,
              order, or commission involved.
            </>
          ),
        },
      ]}
      related={[
        { label: 'Contact', href: '/contact' },
        { label: 'Report an Issue', href: '/report-issue' },
      ]}
    />
  );
}
