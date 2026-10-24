import ReportIssueForm from './ReportIssueForm';

export const metadata = { title: 'Report an Artist or Artwork | Artist_Platform' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ targetType?: string; targetSlug?: string; targetName?: string }>;
}) {
  const query = await searchParams;
  const targetType =
    query.targetType === 'USER' || query.targetType === 'ARTWORK' ? query.targetType : null;
  return (
    <ReportIssueForm
      targetType={targetType}
      targetSlug={query.targetSlug ?? ''}
      targetName={query.targetName ?? ''}
    />
  );
}
