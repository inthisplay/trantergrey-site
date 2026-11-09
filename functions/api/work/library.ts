import type { AdminEnvironment } from '../../_lib/admin';
import { readEnrichedMuxLibrary } from '../../_lib/mux-library';

type Context = { env: AdminEnvironment };

function publicVideo(asset: Awaited<ReturnType<typeof readEnrichedMuxLibrary>>['assets'][number]) {
  const createdAt = asset.historicCreatedAt || asset.createdAt;
  const seconds = asset.duration;
  return {
    id: asset.id,
    muxPlaybackId: asset.playbackId,
    title: asset.title || 'Untitled film',
    client: asset.client || '',
    year: createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear(),
    duration: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`,
    kind: '',
    industry: '',
    thumbnail: asset.thumbnailUrl || '',
    searchTerms: asset.localTags.join(' '),
  };
}

export async function onRequestGet({ env }: Context): Promise<Response> {
  const library = await readEnrichedMuxLibrary(env);
  const videos = library.assets
    .filter((asset) => asset.libraryStatus === 'published' && asset.playbackId && asset.playbackPolicy === 'public')
    .map(publicVideo);

  return Response.json(
    { videos },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
