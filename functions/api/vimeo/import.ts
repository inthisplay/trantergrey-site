import { adminResponse } from '../../_lib/admin';
import { getVimeoConnection, type VimeoEnvironment } from '../../_lib/vimeo-connection';
import { readVimeoLibrary, writeVimeoLibrary, type VimeoLibrary, type VimeoVideo } from '../../_lib/vimeo-state';

type Context = { request: Request; env: VimeoEnvironment };
type VimeoApiVideo = {
  uri?: string; name?: string; description?: string | null; duration?: number; created_time?: string; modified_time?: string; link?: string; player_embed_url?: string;
  pictures?: { sizes?: Array<{ link?: string; width?: number }> }; tags?: Array<{ name?: string }>; privacy?: { view?: string }; status?: string; width?: number; height?: number;
};
type VimeoPage = { data?: VimeoApiVideo[]; paging?: { next?: string | null } };

function toLibraryVideo(video: VimeoApiVideo): VimeoVideo | null {
  const id = video.uri?.split('/').filter(Boolean).at(-1);
  if (!id) return null;
  const pictures = video.pictures?.sizes ?? [];
  const thumbnail = [...pictures].sort((first, second) => (second.width ?? 0) - (first.width ?? 0))[0]?.link ?? null;
  return {
    vimeoUri: video.uri, id, title: video.name?.trim() || 'Untitled Vimeo video', description: video.description?.trim() || '', duration: video.duration ?? 0,
    createdAt: video.created_time ?? null, modifiedAt: video.modified_time ?? null, url: video.link ?? null, embedUrl: video.player_embed_url ?? null,
    thumbnailUrl: thumbnail, tags: (video.tags ?? []).map((tag) => tag.name?.trim()).filter((tag): tag is string => Boolean(tag)), privacy: video.privacy?.view ?? null,
    status: video.status ?? null, width: video.width ?? null, height: video.height ?? null, libraryStatus: 'unreviewed',
  };
}

function importUrl() {
  const url = new URL('https://api.vimeo.com/me/videos');
  url.searchParams.set('per_page', '100');
  url.searchParams.set('sort', 'date');
  url.searchParams.set('direction', 'desc');
  url.searchParams.set('fields', ['uri', 'name', 'description', 'duration', 'created_time', 'modified_time', 'link', 'player_embed_url', 'pictures.sizes', 'tags.name', 'privacy.view', 'status', 'width', 'height'].join(','));
  return url.toString();
}

async function mode(request: Request) {
  try { return (await request.json() as { mode?: string }).mode === 'full' ? 'full' : 'incremental'; } catch { return 'incremental'; }
}

function preserveEdits(next: VimeoVideo[], existing: VimeoLibrary | null) {
  const previous = new Map(existing?.videos.map((video) => [video.id, video]));
  return next.map((video) => {
    const prior = previous.get(video.id);
    return prior ? { ...video, libraryStatus: prior.libraryStatus, customTitle: prior.customTitle, client: prior.client, localTags: prior.localTags } : video;
  });
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  const connection = await getVimeoConnection(env);
  if (!connection) return Response.json({ error: 'Connect Vimeo before importing.' }, { status: 401 });

  try {
    const requestedMode = await mode(request);
    const existing = await readVimeoLibrary(env);
    const full = requestedMode === 'full' || !existing;
    const known = new Set(existing?.videos.map((video) => video.id));
    const fetched: VimeoVideo[] = [];
    let next: string | null = importUrl();
    let reachedKnown = false;
    let scanned = 0;

    while (next && (full || !reachedKnown)) {
      const response = await fetch(next, { headers: { Authorization: `bearer ${connection.accessToken}`, Accept: 'application/vnd.vimeo.*+json;version=3.4' } });
      if (!response.ok) throw new Error(`Vimeo returned ${response.status}.`);
      const page = await response.json() as VimeoPage;
      const videos = (page.data ?? []).map(toLibraryVideo).filter((video): video is VimeoVideo => Boolean(video));
      scanned += videos.length;
      if (!full && videos.some((video) => known.has(video.id))) reachedKnown = true;
      fetched.push(...(full ? videos : videos.filter((video) => !known.has(video.id))));
      next = page.paging?.next ? `https://api.vimeo.com${page.paging.next}` : null;
    }

    const videos = full ? preserveEdits(fetched, existing) : [...fetched, ...(existing?.videos ?? [])];
    const clients = existing?.clients ?? [];
    const library: VimeoLibrary = { importedAt: new Date().toISOString(), source: 'vimeo', clients, videos };
    await writeVimeoLibrary(env, library);
    return Response.json({ mode: full ? 'full' : 'incremental', imported: full ? videos.length : fetched.length, total: videos.length, scanned });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The Vimeo import failed.' }, { status: 502 });
  }
}
