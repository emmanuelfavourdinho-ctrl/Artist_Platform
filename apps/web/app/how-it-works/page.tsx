import { InformationPage } from '../../components/content/InformationPage';
export const metadata = { title: 'How It Works | Artist_Platform' };
export default function Page() {
  return (
    <InformationPage
      eyebrow="Buying"
      title="From discovery to delivery."
      intro="Artist_Platform connects buyers with original work and the people who make it."
      sections={[
        {
          heading: 'Discover and explore',
          body: (
            <>
              Browse the gallery, artist profiles, and community stories. Save work you want to
              revisit, then open an artwork page for its details, price, availability, and artist
              context.
            </>
          ),
        },
        {
          heading: 'Purchase and order',
          body: (
            <>
              When checkout and payment infrastructure are enabled for your account, a purchase
              becomes an order. Orders are the authoritative place for purchase status and delivery
              information.
            </>
          ),
        },
        {
          heading: 'After purchase',
          body: (
            <>
              Keep communication in the platform and check your account for order updates. Delivery
              and completion details depend on the order features available for the transaction.
            </>
          ),
        },
      ]}
      related={[
        { label: 'Payments', href: '/payments' },
        { label: 'Shipping & Delivery', href: '/shipping-delivery' },
        { label: 'Buyer Protection', href: '/buyer-protection' },
      ]}
    />
  );
}
