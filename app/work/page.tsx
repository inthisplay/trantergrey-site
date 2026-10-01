import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { VideoGallery } from '@/components/VideoGallery';
import { toPublicVideo } from '@/lib/videos';
import { getVimeoLibrary } from '@/lib/vimeo-library';

export const metadata = { title: 'Work Library — TranterGrey' };
export const dynamic = 'force-dynamic';

export default async function WorkPage() {
  const library = await getVimeoLibrary();
  const published = library?.videos.filter((video) => video.libraryStatus === 'published').map(toPublicVideo) ?? [];
  return <><main id="top"><section className="library-hero"><SiteHeader /><div><p className="eyebrow">TranterGrey work library</p><h1>All signal.<br /><em>No filler.</em></h1><p>{published.length ? 'A curated selection of brand films, campaign stories, and commercials.' : 'New work is being curated now. Check back soon.'}</p></div></section><section className="library-section">{published.length ? <VideoGallery videos={published} /> : <p className="work-empty">There are no published films yet.</p>}</section></main><SiteFooter /></>;
}
