import { InformationPage } from '../../components/content/InformationPage';
export const metadata = { title: 'Buyer Protection | Artist_Platform' };
export default function Page() {
  return (
    <InformationPage
      eyebrow="Buying"
      title="Make informed purchases."
      intro="Authenticated accounts, artist profiles, order records, and contextual communication support safer marketplace decisions."
      sections={[
        {
          heading: 'Use the platform record',
          body: (
            <>
              Review artist and artwork information before committing. Keep important communication
              on Fine_Arts and use the order record as your transaction reference.
            </>
          ),
        },
        {
          heading: 'Be clear about the boundary',
          body: (
            <>
              The platform does not claim guarantees beyond protections that are actually
              implemented and shown in your account.
            </>
          ),
        },
      ]}
    />
  );
}
