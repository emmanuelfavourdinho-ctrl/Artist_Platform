import { InformationPage } from '../../components/content/InformationPage';
export const metadata = { title: 'Payments | Artist_Platform' };
export default function Page() {
  return (
    <InformationPage
      eyebrow="Buying"
      title="Payments belong to the order."
      intro="Payment processing is being built separately from this marketplace information system."
      sections={[
        {
          heading: 'Current boundary',
          body: (
            <>
              When enabled, payment records and order status will be authoritative. Do not treat a
              message or off-platform transfer as payment confirmation.
            </>
          ),
        },
        {
          heading: 'Commissions',
          body: (
            <>
              Accepting a commission proposal records your decision. Payment is a later transaction
              step and is not fabricated here.
            </>
          ),
        },
      ]}
    />
  );
}
