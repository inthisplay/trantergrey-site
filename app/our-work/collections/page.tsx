import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata = { title: 'Collections — TranterGrey' };

export default function CollectionsIndexPage() {
  return <><main id="top" className="work-collections-page"><SiteHeader /><section className="work-collections-intro"><p className="eyebrow">Our Work / Collections</p><h1>Focused<br /><em>edits.</em></h1><p>Collections bring together films that share a subject, style, or point of view. The first selections are being curated now.</p><a className="connect-button" href="/our-work">Browse Our Work</a></section></main><SiteFooter /></>;
}
