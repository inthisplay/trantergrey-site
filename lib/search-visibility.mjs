// Only the deliberately published marketing pages belong in search results.
const marketingPages = new Set(['/', '/our-work', '/case-studies', '/privacy-policy', '/terms-and-conditions']);
export const unlistedRobots = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

export function isUnlistedPath(pathname) {
  const path = pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  if (marketingPages.has(path) || path.startsWith('/case-studies/')) return false;
  // These are checked-in marketing/build assets, not user-uploaded assets.
  if (['/assets/', '/fonts/', '/_next/'].some(prefix => path.startsWith(prefix))) return false;
  return true;
}
