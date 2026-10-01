import { NextResponse } from 'next/server';
import { getVimeoConnection } from '@/lib/vimeo-connection';
import { appendNewVimeoLibraryVideos, getVimeoLibrary, preserveLibraryEdits, saveVimeoLibrary, type VimeoLibraryVideo } from '@/lib/vimeo-library';

export const runtime = 'nodejs';

type VimeoApiVideo = {
  uri?: string;
  name?: string;
  description?: string | null;
  duration?: number;
  created_time?: string;
  modified_time?: string;
  link?: string;
  player_embed_url?: string;
  pictures?: { sizes?: Array<{ link?: string; width?: number }> };
  tags?: Array<{ name?: string }>;
  privacy?: { view?: string };
  status?: string;
  width?: number;
  height?: number;
};

type VimeoApiPage = {
  data?: VimeoApiVideo[];
  paging?: { next?: string | null };
};

function toLibraryVideo(video: VimeoApiVideo): VimeoLibraryVideo | null {
  if (!video.uri) return null;
  const id = video.uri.split('/').filter(Boolean).at(-1);
  if (!id) return null;
  const pictures = video.pictures?.sizes ?? [];
  const thumbnail = [...pictures].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.link ?? null;
  return {
    vimeoUri: video.uri,
    id,
    title: video.name?.trim() || 'Untitled Vimeo video',
    description: video.description?.trim() || '',
    duration: video.duration ?? 0,
    createdAt: video.created_time ?? null,
    modifiedAt: video.modified_time ?? null,
    url: video.link ?? null,
    embedUrl: video.player_embed_url ?? null,
    thumbnailUrl: thumbnail,
    tags: (video.tags ?? []).map((tag) => tag.name?.trim()).filter((tag): tag is string => Boolean(tag)),
    privacy: video.privacy?.view ?? null,
    status: video.status ?? null,
    width: video.width ?? null,
    height: video.height ?? null,
    libraryStatus: 'unreviewed',
  };
}

function importUrl(fields: string) {
  const url = new URL('https://api.vimeo.com/me/videos');
  url.searchParams.set('per_page', '100');
  url.searchParams.set('sort', 'date');
  url.searchParams.set('direction', 'desc');
  url.searchParams.set('fields', fields);
  return url.toString();
}

async function readImportMode(request: Request) {
  try {
    const body = await request.json() as { mode?: unknown };
    return body.mode === 'full' ? 'full' : 'incremental';
  } catch {
    return 'incremental';
  }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Library import requires the protected admin area.' }, { status: 403 });

  const connection = await getVimeoConnection();
  if (!connection) return NextResponse.json({ error: 'Connect Vimeo before importing.' }, { status: 401 });

  try {
    const requestedMode = await readImportMode(request);
    const existingLibrary = await getVimeoLibrary();
    const mode = requestedMode === 'full' || !existingLibrary ? 'full' : 'incremental';
    const knownIds = new Set(existingLibrary?.videos.map((video) => video.id));
    const fields = ['uri', 'name', 'description', 'duration', 'created_time', 'modified_time', 'link', 'player_embed_url', 'pictures.sizes', 'tags.name', 'privacy.view', 'status', 'width', 'height'].join(',');
    let next: string | null = importUrl(fields);
    let reachedKnownVideo = false;
    let scanned = 0;
    const videos: VimeoLibraryVideo[] = [];

    while (next && (mode === 'full' || !reachedKnownVideo)) {
      const response = await fetch(next, { headers: { Authorization: `bearer ${connection.accessToken}`, Accept: 'application/vnd.vimeo.*+json;version=3.4' }, cache: 'no-store' });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Vimeo returned ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ''}`);
      }
      const page = await response.json() as VimeoApiPage;
      const pageVideos = (page.data ?? []).map(toLibraryVideo).filter((video): video is VimeoLibraryVideo => Boolean(video));
      scanned += pageVideos.length;
      if (mode === 'incremental' && pageVideos.some((video) => knownIds.has(video.id))) reachedKnownVideo = true;
      videos.push(...(mode === 'incremental' ? pageVideos.filter((video) => !knownIds.has(video.id)) : pageVideos));
      next = page.paging?.next ? `https://api.vimeo.com${page.paging.next}` : null;
    }

    if (mode === 'full') {
      const merged = await preserveLibraryEdits(videos);
      await saveVimeoLibrary({ importedAt: new Date().toISOString(), source: 'vimeo', ...merged });
      return NextResponse.json({ mode, imported: merged.videos.length, total: merged.videos.length, scanned });
    }

    const result = await appendNewVimeoLibraryVideos(videos);
    if (!result) throw new Error('The local library is unavailable.');
    return NextResponse.json({ mode, imported: result.imported, total: result.total, scanned });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The Vimeo import failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
