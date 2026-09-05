import { InformationPage } from '../../components/content/InformationPage';
export const metadata = { title: 'Shipping & Delivery | Artist_Platform' };
export default function Page() {
  return (
    <InformationPage
      eyebrow="Buying"
      title="Shipping follows the order record."
      intro="Delivery information belongs to the order and shipment systems."
      sections={[
        {
          heading: 'After purchase',
          body: (
            <>
              Preparation and handover updates should appear against the order when those
              capabilities are available.
            </>
          ),
        },
        {
          heading: 'Delivery issues',
          body: (
            <>
              Keep your order reference and contact the platform through support. Do not rely on
              unrecorded delivery promises in chat.
            </>
          ),
        },
      ]}
    />
  );
}
