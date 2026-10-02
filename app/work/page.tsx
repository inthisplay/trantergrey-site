import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { VideoGallery } from '@/components/VideoGallery';
import { WorkThumbnailParallax } from '@/components/WorkThumbnailParallax';
import { toPublicVideo } from '@/lib/videos';
import { getVimeoLibrary } from '@/lib/vimeo-library';

export const metadata = { title: 'Work Library — TranterGrey' };
export const dynamic = 'force-dynamic';

export default async function WorkPage() {
  const library = await getVimeoLibrary();
  const published = library?.videos.filter((video) => video.libraryStatus === 'published').map(toPublicVideo) ?? [];
  return <><main id="top"><section className="library-hero"><div className="library-hero-video" aria-hidden="true"><iframe src="https://player.vimeo.com/video/701670992?h=74201d7b09&background=1&autoplay=1&loop=1&muted=1&autopause=0&title=0&byline=0&portrait=0" allow="autoplay" title="" /></div><div className="library-hero-wash" aria-hidden="true" /><SiteHeader /><div className="library-hero-content"><h1>Watch <em>this.</em></h1></div></section><section className="library-section"><WorkThumbnailParallax />{published.length ? <VideoGallery videos={published} /> : <p className="work-empty">There are no published films yet.</p>}</section></main><SiteFooter /></>;
}
