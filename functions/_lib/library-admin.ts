import type { AdminEnvironment } from './admin';
import { readVimeoLibrary, writeVimeoLibrary, type VimeoLibrary, type VimeoVideo } from './vimeo-state';

export type LibraryEnvironment = AdminEnvironment;

export async function libraryOrNull(env: LibraryEnvironment) {
  return readVimeoLibrary(env);
}

export async function updateLibraryVideo(env: LibraryEnvironment, id: string, update: (video: VimeoVideo) => VimeoVideo) {
  const library = await readVimeoLibrary(env);
  if (!library) return null;
  const index = library.videos.findIndex((video) => video.id === id);
  if (index < 0) return null;
  const videos = [...library.videos];
  videos[index] = update(videos[index]);
  const next: VimeoLibrary = { ...library, videos };
  await writeVimeoLibrary(env, next);
  return videos[index];
}

export async function updateLibrary(env: LibraryEnvironment, update: (library: VimeoLibrary) => VimeoLibrary) {
  const library = await readVimeoLibrary(env);
  if (!library) return null;
  const next = update(library);
  await writeVimeoLibrary(env, next);
  return next;
}

export function cleanTags(value: unknown) {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string')) return null;
  const tags = value.map((tag) => tag.trim().replace(/\s+/g, ' ')).filter(Boolean).filter((tag, index, all) => all.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === index);
  return tags.length <= 24 && tags.every((tag) => tag.length <= 48) ? tags : null;
}
