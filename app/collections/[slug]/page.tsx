import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { VideoGallery } from '@/components/VideoGallery';
import { collectionVideos, getWorkCollectionBySlug } from '@/lib/work-collections';
import { getVimeoLibrary } from '@/lib/vimeo-library';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getWorkCollectionBySlug(slug);
  return { title: collection ? `${collection.name} — TranterGrey` : 'Collection — TranterGrey', robots: { index: false, follow: false } };
}

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params;
  const [collection, library] = await Promise.all([getWorkCollectionBySlug(slug), getVimeoLibrary()]);
  if (!collection || !library) notFound();
  const videos = collectionVideos(collection, library);
  return <><main id="top"><section className="collection-hero"><SiteHeader /><div className="collection-hero-content"><p className="eyebrow">A private TranterGrey selection</p><h1>{collection.name}</h1><p>{collection.includePublished ? 'A shared edit from the full TranterGrey work library, plus a few extras.' : 'A hand-picked edit from the TranterGrey film library.'}</p></div></section><section className="library-section">{videos.length ? <VideoGallery videos={videos} /> : <p className="work-empty">This collection does not have any videos yet.</p>}</section></main><SiteFooter /></>;
}
