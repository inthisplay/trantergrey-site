import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { PublishedWorkGallery } from '@/components/PublishedWorkGallery';
import { WorkHeroVideo } from '@/components/WorkHeroVideo';
import { toPublicVideo } from '@/lib/videos';
import { getVimeoLibrary } from '@/lib/vimeo-library';

export const metadata = { title: 'Our Work — TranterGrey' };
export const dynamic = 'force-dynamic';

export default async function OurWorkPage() {
  const library = await getVimeoLibrary();
  const published = library?.videos.filter((video) => video.libraryStatus === 'published').map(toPublicVideo) ?? [];
  return <><main id="top"><section className="library-hero"><WorkHeroVideo /><div className="library-hero-wash" aria-hidden="true" /><SiteHeader /><div className="library-hero-content"><h1>Watch <em>this.</em></h1></div></section><section className="library-section"><PublishedWorkGallery initialVideos={published} /></section></main><SiteFooter /></>;
}
