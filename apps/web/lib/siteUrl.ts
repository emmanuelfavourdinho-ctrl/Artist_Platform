const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const siteUrl = new URL(configuredSiteUrl.endsWith('/') ? configuredSiteUrl : `${configuredSiteUrl}/`);

export function publicUrl(path: string): string {
  return new URL(path.startsWith('/') ? path.slice(1) : path, siteUrl).toString();
}
