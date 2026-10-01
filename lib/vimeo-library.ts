import { promises as fs } from 'node:fs';
import path from 'node:path';

export type VimeoLibraryVideo = {
  vimeoUri: string;
  id: string;
  title: string;
  customTitle?: string | null;
  client?: string | null;
  localTags?: string[];
  description: string;
  duration: number;
  createdAt: string | null;
  modifiedAt: string | null;
  url: string | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
  tags: string[];
  privacy: string | null;
  status: string | null;
  width: number | null;
  height: number | null;
  libraryStatus: 'unreviewed' | 'published' | 'hidden';
};

export type VimeoLibrary = {
  importedAt: string;
  source: 'vimeo';
  clients?: string[];
  videos: VimeoLibraryVideo[];
};

const libraryFile = path.join(process.cwd(), 'data', 'vimeo-library.json');

export async function getVimeoLibrary(): Promise<VimeoLibrary | null> {
  try {
    return JSON.parse(await fs.readFile(libraryFile, 'utf8')) as VimeoLibrary;
  } catch {
    return null;
  }
}

export async function getVimeoLibrarySummary() {
  const library = await getVimeoLibrary();
  return library ? { count: library.videos.length, importedAt: library.importedAt } : null;
}

export async function saveVimeoLibrary(library: VimeoLibrary) {
  await fs.mkdir(path.dirname(libraryFile), { recursive: true, mode: 0o700 });
  const temporaryFile = `${libraryFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(library), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporaryFile, libraryFile);
  await fs.chmod(libraryFile, 0o600);
}

export async function appendNewVimeoLibraryVideos(videos: VimeoLibraryVideo[]) {
  const library = await getVimeoLibrary();
  if (!library) return null;
  const existingIds = new Set(library.videos.map((video) => video.id));
  const newVideos = videos.filter((video) => !existingIds.has(video.id));
  await saveVimeoLibrary({ ...library, importedAt: new Date().toISOString(), videos: [...newVideos, ...library.videos] });
  return { imported: newVideos.length, total: library.videos.length + newVideos.length };
}

export async function setVimeoLibraryStatus(id: string, libraryStatus: VimeoLibraryVideo['libraryStatus']) {
  const library = await getVimeoLibrary();
  if (!library) return null;
  const video = library.videos.find((item) => item.id === id);
  if (!video) return null;
  video.libraryStatus = libraryStatus;
  await saveVimeoLibrary(library);
  return video;
}

export async function setVimeoLibraryCustomTitle(id: string, customTitle: string | null) {
  const library = await getVimeoLibrary();
  if (!library) return null;
  const video = library.videos.find((item) => item.id === id);
  if (!video) return null;
  video.customTitle = customTitle;
  await saveVimeoLibrary(library);
  return video;
}

export async function setVimeoLibraryClient(id: string, client: string | null) {
  const library = await getVimeoLibrary();
  if (!library) return null;
  const video = library.videos.find((item) => item.id === id);
  if (!video) return null;
  video.client = client;
  const clients = new Set(library.clients ?? library.videos.map((item) => item.client).filter((item): item is string => Boolean(item)));
  if (client) clients.add(client);
  library.clients = [...clients].sort((a, b) => a.localeCompare(b));
  await saveVimeoLibrary(library);
  return video;
}

function cleanLocalTags(tags: string[]) {
  const seen = new Set<string>();
  return tags.map((tag) => tag.trim().replace(/\s+/g, ' ').slice(0, 48)).filter((tag) => {
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 24);
}

export async function setVimeoLibraryLocalTags(id: string, tags: string[]) {
  const library = await getVimeoLibrary();
  if (!library) return null;
  const video = library.videos.find((item) => item.id === id);
  if (!video) return null;
  video.localTags = cleanLocalTags(tags);
  await saveVimeoLibrary(library);
  return video;
}

export async function deleteVimeoLibraryClient(client: string) {
  const library = await getVimeoLibrary();
  if (!library) return null;
  let unassigned = 0;
  for (const video of library.videos) {
    if (video.client === client) {
      video.client = null;
      unassigned += 1;
    }
  }
  library.clients = (library.clients ?? []).filter((name) => name !== client);
  await saveVimeoLibrary(library);
  return { client, unassigned };
}

export async function preserveLibraryEdits(videos: VimeoLibraryVideo[]) {
  const existing = await getVimeoLibrary();
  const previousById = new Map(existing?.videos.map((video) => [video.id, video]));
  return { clients: existing?.clients ?? [], videos: videos.map((video) => {
    const previous = previousById.get(video.id);
    return previous ? { ...video, libraryStatus: previous.libraryStatus, customTitle: previous.customTitle, client: previous.client, localTags: previous.localTags } : video;
  }) };
}

export async function refreshPublishedVimeoVideos(refreshedVideos: VimeoLibraryVideo[]) {
  const library = await getVimeoLibrary();
  if (!library) return null;
  const refreshedById = new Map(refreshedVideos.map((video) => [video.id, video]));
  library.videos = library.videos.map((video) => {
    const refreshed = refreshedById.get(video.id);
    return refreshed ? { ...refreshed, libraryStatus: video.libraryStatus, customTitle: video.customTitle, client: video.client, localTags: video.localTags } : video;
  });
  await saveVimeoLibrary(library);
  return refreshedVideos.length;
}
