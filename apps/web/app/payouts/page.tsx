import { InformationPage } from '../../components/content/InformationPage';
export const metadata = { title: 'Payouts | Artist_Platform' };
export default function Page() {
  return (
    <InformationPage
      eyebrow="Selling"
      title="Payouts are coming with payment infrastructure."
      intro="Payout processing is not enabled in this phase."
      sections={[
        {
          heading: 'Current state',
          body: (
            <>
              Artist Studio can manage artwork and commission workflow data, but this platform does
              not yet claim payout timing, methods, eligibility, or settlement status.
            </>
          ),
        },
        {
          heading: 'What changes later',
          body: (
            <>
              This resource will be updated when payout infrastructure is implemented and
              documented.
            </>
          ),
        },
      ]}
    />
  );
}
