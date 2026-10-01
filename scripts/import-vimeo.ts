import { getVimeoConnection } from '../lib/vimeo-connection.ts';
import { preserveLibraryEdits, saveVimeoLibrary, type VimeoLibraryVideo } from '../lib/vimeo-library.ts';

type VimeoApiVideo = {
  uri?: string; name?: string; description?: string | null; duration?: number;
  created_time?: string; modified_time?: string; link?: string; player_embed_url?: string;
  pictures?: { sizes?: Array<{ link?: string; width?: number }> };
  tags?: Array<{ name?: string }>; privacy?: { view?: string }; status?: string; width?: number; height?: number;
};
type VimeoApiPage = { data?: VimeoApiVideo[]; paging?: { next?: string | null } };

function toLibraryVideo(video: VimeoApiVideo): VimeoLibraryVideo | null {
  if (!video.uri) return null;
  const id = video.uri.split('/').filter(Boolean).at(-1);
  if (!id) return null;
  const thumbnail = [...(video.pictures?.sizes ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.link ?? null;
  return {
    vimeoUri: video.uri, id, title: video.name?.trim() || 'Untitled Vimeo video', description: video.description?.trim() || '',
    duration: video.duration ?? 0, createdAt: video.created_time ?? null, modifiedAt: video.modified_time ?? null,
    url: video.link ?? null, embedUrl: video.player_embed_url ?? null, thumbnailUrl: thumbnail,
    tags: (video.tags ?? []).map((tag) => tag.name?.trim()).filter((tag): tag is string => Boolean(tag)),
    privacy: video.privacy?.view ?? null, status: video.status ?? null, width: video.width ?? null, height: video.height ?? null,
    libraryStatus: 'unreviewed',
  };
}

const connection = await getVimeoConnection();
if (!connection) throw new Error('Connect Vimeo before importing.');
const fields = ['uri', 'name', 'description', 'duration', 'created_time', 'modified_time', 'link', 'player_embed_url', 'pictures.sizes', 'tags.name', 'privacy.view', 'status', 'width', 'height'].join(',');
let next: string | null = `https://api.vimeo.com/me/videos?per_page=100&fields=${encodeURIComponent(fields)}`;
const videos: VimeoLibraryVideo[] = [];
let page = 0;

while (next) {
  const response = await fetch(next, { headers: { Authorization: `bearer ${connection.accessToken}`, Accept: 'application/vnd.vimeo.*+json;version=3.4' } });
  if (!response.ok) throw new Error(`Vimeo returned ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const payload = await response.json() as VimeoApiPage;
  videos.push(...(payload.data ?? []).map(toLibraryVideo).filter((video): video is VimeoLibraryVideo => Boolean(video)));
  next = payload.paging?.next ? `https://api.vimeo.com${payload.paging.next}` : null;
  page += 1;
  console.log(`Fetched page ${page}: ${videos.length} videos`);
}

const merged = await preserveLibraryEdits(videos);
await saveVimeoLibrary({ importedAt: new Date().toISOString(), source: 'vimeo', ...merged });
console.log(`Imported ${merged.videos.length} videos for private review.`);
