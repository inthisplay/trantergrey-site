import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { PublicCollections } from '@/components/PublicCollections';

export const metadata = { title: 'Collections — TranterGrey' };

export default function CollectionsIndexPage() {
  return <><main id="top" className="work-collections-page"><SiteHeader /><PublicCollections /></main><SiteFooter /></>;
}
