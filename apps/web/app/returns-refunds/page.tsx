import { InformationPage } from '../../components/content/InformationPage';
export const metadata = { title: 'Returns & Refunds | Artist_Platform' };
export default function Page() {
  return (
    <InformationPage
      eyebrow="Buying"
      title="Returns and refunds require a finalized policy."
      intro="This resource does not invent eligibility, windows, or guarantees that are not yet implemented."
      sections={[
        {
          heading: 'Before committing',
          body: (
            <>
              Review the artwork, artist information, order details, and any applicable agreement
              before proceeding.
            </>
          ),
        },
        {
          heading: 'Policy status',
          body: (
            <>
              This page will be updated when the marketplace returns, refunds, and commission
              cancellation policy is finalized.
            </>
          ),
        },
      ]}
    />
  );
}
