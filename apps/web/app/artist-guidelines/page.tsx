import { InformationPage } from '../../components/content/InformationPage';
export const metadata = { title: 'Artist Guidelines | Artist_Platform' };
export default function Page() {
  return (
    <InformationPage
      eyebrow="Selling"
      title="Make the work easy to trust."
      intro="Clear, accurate information helps collectors understand your practice and your work."
      sections={[
        {
          heading: 'Publish accurately',
          body: (
            <>
              Use authentic work, accurate dimensions and descriptions, truthful pricing, clear
              images, and only content you have the rights to publish.
            </>
          ),
        },
        {
          heading: 'Work professionally',
          body: (
            <>
              Communicate respectfully, keep commitments visible, and treat buyers and other artists
              with care.
            </>
          ),
        },
      ]}
    />
  );
}
