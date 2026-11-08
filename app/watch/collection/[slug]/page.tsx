import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getMuxLibraryAssets } from '@/lib/mux-api';
import { getVideoProjectCollectionBySlug, getVideoProjectStore } from '@/lib/video-projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const collection = await getVideoProjectCollectionBySlug((await params).slug);
  return { title: collection ? `${collection.name} — TranterGrey` : 'Collection — TranterGrey', description: collection?.description || 'A video collection from TranterGrey.', robots: { index: false, follow: false } };
}

export default async function WatchCollectionPage({ params }: PageProps) {
  const collection = await getVideoProjectCollectionBySlug((await params).slug);
  if (!collection) notFound();
  const [store, assets] = await Promise.all([
    getVideoProjectStore(),
    getMuxLibraryAssets({ tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET }),
  ]);
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const projects = store.projects.filter((project) => project.collectionIds.includes(collection.id));

  return <main className="solo-video-page collection-page"><SiteHeader /><section className="solo-video-shell">
    <div className="solo-video-heading"><p className="eyebrow">TranterGrey collection</p><h1>{collection.name}</h1>{collection.description && <p>{collection.description}</p>}</div>
    {projects.length ? <div className="solo-collection-grid">{projects.map((project) => {
      const cover = byId.get(project.variants[0]?.assetId);
      return <a href={`/watch/${project.slug}`} key={project.id}><span>{cover?.thumbnailUrl ? <img src={cover.thumbnailUrl} alt="" /> : <i>Preview unavailable</i>}</span><small>{project.client || 'TranterGrey'} · {project.variants.length} {project.variants.length === 1 ? 'ratio' : 'ratios'}</small><h2>{project.title}</h2></a>;
    })}</div> : <p className="solo-video-unavailable">No videos have been added to this collection yet.</p>}
  </section><SiteFooter /></main>;
}
