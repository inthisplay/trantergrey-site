import { readCollections, type Collection } from '../../_lib/collections';
import type { AdminEnvironment } from '../../_lib/admin';
import { readVimeoLibrary, type VimeoVideo } from '../../_lib/vimeo-state';

type Context = { request: Request; env: AdminEnvironment };

const text = (value: unknown) => typeof value === 'string' ? value : '';
const number = (value: unknown) => typeof value === 'number' ? value : 0;

function publicVideo(video: VimeoVideo) {
  const embedUrl = text(video.embedUrl);
  let hash: string | undefined;
  try { hash = embedUrl ? new URL(embedUrl).searchParams.get('h') || undefined : undefined; } catch { hash = undefined; }
  const seconds = number(video.duration);
  const createdAt = text(video.createdAt);
  return {
    id: video.id,
    hash,
    title: text(video.customTitle) || text(video.title) || 'Untitled film',
    client: text(video.client),
    year: createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear(),
    duration: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
    kind: '', industry: '', thumbnail: text(video.thumbnailUrl),
    searchTerms: [text(video.description), ...(Array.isArray(video.tags) ? video.tags.filter((tag): tag is string => typeof tag === 'string') : []), ...(Array.isArray(video.localTags) ? video.localTags.filter((tag): tag is string => typeof tag === 'string') : [])].join(' '),
  };
}

function collectionVideos(collection: Collection, videos: VimeoVideo[]) {
  const byId = new Map(videos.map((video) => [video.id, video]));
  const ids = new Set(collection.videoIds);
  if (collection.includePublished) videos.filter((video) => video.libraryStatus === 'published').forEach((video) => ids.add(video.id));
  return [...ids].map((id) => byId.get(id)).filter((video): video is VimeoVideo => Boolean(video)).map(publicVideo);
}

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const slug = new URL(request.url).searchParams.get('slug')?.trim().toLowerCase();
  const [collections, library] = await Promise.all([readCollections(env), readVimeoLibrary(env)]);
  if (slug) {
    const collection = collections.find((item) => item.slug === slug);
    if (!collection) return Response.json({ error: 'Collection not found.' }, { status: 404 });
    return Response.json({ collection: { name: collection.name, slug: collection.slug, isPrivate: collection.isPrivate, videos: collectionVideos(collection, library?.videos ?? []) } });
  }
  return Response.json({ collections: collections.filter((collection) => !collection.isPrivate).map((collection) => ({ name: collection.name, slug: collection.slug, videoCount: collectionVideos(collection, library?.videos ?? []).length })) });
}
