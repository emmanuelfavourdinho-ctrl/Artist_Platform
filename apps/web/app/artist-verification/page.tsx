import { InformationPage } from '../../components/content/InformationPage';
export const metadata = { title: 'Artist Verification | Artist_Platform' };
export default function Page() {
  return (
    <InformationPage
      eyebrow="Selling"
      title="Verification is a trust signal."
      intro="The badge represents an artist profile that has passed the platform review state shown in the account."
      sections={[
        {
          heading: 'What it means',
          body: (
            <>
              Verification helps collectors understand profile status. It does not guarantee that
              every work or interaction is risk-free.
            </>
          ),
        },
        {
          heading: 'Keep expectations accurate',
          body: (
            <>
              Do not treat verification as absolute endorsement or a substitute for reviewing
              artwork information.
            </>
          ),
        },
      ]}
    />
  );
}
