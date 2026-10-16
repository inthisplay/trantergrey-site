import { NextResponse } from 'next/server';
import { getVimeoConnection } from '@/lib/vimeo-connection';
import { getVimeoLibrary, refreshPublishedVimeoVideos, type VimeoLibraryVideo } from '@/lib/vimeo-library';
import { requireAdminApi } from '@/lib/admin-auth';

export const runtime = 'nodejs';

type VimeoApiVideo = { uri?: string; name?: string; description?: string | null; duration?: number; created_time?: string; modified_time?: string; link?: string; player_embed_url?: string; pictures?: { sizes?: Array<{ link?: string; width?: number }> }; tags?: Array<{ name?: string }>; privacy?: { view?: string }; status?: string; width?: number; height?: number };
const fields = ['uri', 'name', 'description', 'duration', 'created_time', 'modified_time', 'link', 'player_embed_url', 'pictures.sizes', 'tags.name', 'privacy.view', 'status', 'width', 'height'].join(',');

function toLibraryVideo(video: VimeoApiVideo, existing: VimeoLibraryVideo): VimeoLibraryVideo {
  const thumbnailUrl = [...(video.pictures?.sizes ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.link ?? existing.thumbnailUrl;
  return { ...existing, vimeoUri: video.uri ?? existing.vimeoUri, title: video.name?.trim() || existing.title, description: video.description?.trim() || '', duration: video.duration ?? existing.duration, createdAt: video.created_time ?? existing.createdAt, modifiedAt: video.modified_time ?? existing.modifiedAt, url: video.link ?? existing.url, embedUrl: video.player_embed_url ?? existing.embedUrl, thumbnailUrl, tags: (video.tags ?? []).map((tag) => tag.name?.trim()).filter((tag): tag is string => Boolean(tag)), privacy: video.privacy?.view ?? existing.privacy, status: video.status ?? existing.status, width: video.width ?? existing.width, height: video.height ?? existing.height };
}

export async function POST() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const [connection, library] = await Promise.all([getVimeoConnection(), getVimeoLibrary()]);
  if (!connection) return NextResponse.json({ error: 'Connect Vimeo before refreshing.' }, { status: 401 });
  if (!library) return NextResponse.json({ error: 'Import the library before refreshing.' }, { status: 404 });
  const published = library.videos.filter((video) => video.libraryStatus === 'published');
  const results = await Promise.allSettled(published.map(async (existing) => {
    const response = await fetch(`https://api.vimeo.com/videos/${existing.id}?fields=${encodeURIComponent(fields)}`, { headers: { Authorization: `bearer ${connection.accessToken}`, Accept: 'application/vnd.vimeo.*+json;version=3.4' }, cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    return toLibraryVideo(await response.json() as VimeoApiVideo, existing);
  }));
  const refreshed = results.filter((result): result is PromiseFulfilledResult<VimeoLibraryVideo> => result.status === 'fulfilled').map((result) => result.value);
  await refreshPublishedVimeoVideos(refreshed);
  return NextResponse.json({ refreshed: refreshed.length, failed: published.length - refreshed.length, total: published.length });
}
