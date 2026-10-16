import { redirect } from 'next/navigation';

// The old public /analytics page called an unauthenticated, unmounted
// endpoint and expected a response shape the API never returned. Analytics
// is an administrator tool now; keep the URL working by forwarding it.
export default function LegacyAnalyticsRedirect() {
  redirect('/admin/analytics');
}
