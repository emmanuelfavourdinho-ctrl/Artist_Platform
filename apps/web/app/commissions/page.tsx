import { InformationPage } from '../../components/content/InformationPage';
export const metadata = { title: 'Commissions | Artist_Platform' };
export default function Page() {
  return (
    <InformationPage
      eyebrow="Selling"
      title="Custom work starts with a clear request."
      intro="A commission is a structured request for custom artwork, separate from buying an existing piece."
      sections={[
        {
          heading: 'The workflow',
          body: (
            <>
              Find an artist, send preferences and references, review the artist proposal, then
              accept or decline it. Payment and production follow the implemented commission state
              and future transaction infrastructure.
            </>
          ),
        },
        {
          heading: 'Keep context together',
          body: (
            <>
              Commission messages and files belong in the authenticated commission conversation when
              that experience is available.
            </>
          ),
        },
      ]}
    />
  );
}
