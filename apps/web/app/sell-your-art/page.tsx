import { InformationPage } from '../../components/content/InformationPage';
export const metadata = { title: 'Sell Your Art | Artist_Platform' };
export default function Page() {
  return (
    <InformationPage
      eyebrow="Selling"
      title="Build your artist presence."
      intro="Create an artist identity, complete onboarding, and use Studio to manage published work."
      sections={[
        {
          heading: 'The journey',
          body: (
            <>
              Choose Sell Artwork, complete your profile, upload owned media through the signed
              Cloudinary flow, and publish accurate artwork details.
            </>
          ),
        },
        {
          heading: 'What Studio does',
          body: (
            <>
              Studio manages artwork and commission workflow data. Payment and payout features are
              separate and should not be represented as available until enabled.
            </>
          ),
        },
      ]}
    />
  );
}
