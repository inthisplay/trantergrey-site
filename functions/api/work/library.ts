import type { AdminEnvironment } from '../../_lib/admin';
import { readVimeoLibrary, type VimeoVideo } from '../../_lib/vimeo-state';

type Context = { env: AdminEnvironment };

const text = (value: unknown) => typeof value === 'string' ? value : '';
const number = (value: unknown) => typeof value === 'number' ? value : 0;

function publicVideo(video: VimeoVideo) {
  const embedUrl = text(video.embedUrl);
  let hash: string | undefined;
  try {
    hash = embedUrl ? new URL(embedUrl).searchParams.get('h') || undefined : undefined;
  } catch {
    hash = undefined;
  }

  const seconds = number(video.duration);
  const createdAt = text(video.createdAt);

  return {
    id: video.id,
    hash,
    title: text(video.customTitle) || text(video.title) || 'Untitled film',
    client: text(video.client),
    year: createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear(),
    duration: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`,
    kind: '',
    industry: '',
    thumbnail: text(video.thumbnailUrl),
    searchTerms: [
      text(video.description),
      ...(Array.isArray(video.tags) ? video.tags.filter((tag): tag is string => typeof tag === 'string') : []),
      ...(Array.isArray(video.localTags) ? video.localTags.filter((tag): tag is string => typeof tag === 'string') : []),
    ].join(' '),
  };
}

export async function onRequestGet({ env }: Context): Promise<Response> {
  const library = await readVimeoLibrary(env);
  const videos = (library?.videos ?? [])
    .filter((video) => video.libraryStatus === 'published')
    .map(publicVideo);

  return Response.json(
    { videos },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
