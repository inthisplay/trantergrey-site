import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dataDirectory } from './data-directory';
import type { VimeoLibrary, VimeoLibraryVideo } from './vimeo-library';
import { toPublicVideo, type Video } from './videos';

export type WorkCollection = {
  id: string;
  name: string;
  slug: string;
  includePublished: boolean;
  videoIds: string[];
  createdAt: string;
  updatedAt: string;
};

type CollectionInput = Pick<WorkCollection, 'name' | 'slug' | 'includePublished'>;
const collectionsFile = path.join(dataDirectory, 'work-collections.json');
const reservedSlugs = new Set(['admin', 'api', 'assets', 'case-studies', 'collections', 'connect-vimeo', 'favicon', 'library', 'login', 'robots', 'sitemap', 'work']);

export function collectionSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
}

function cleanIds(ids: unknown) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && /^\d{5,20}$/.test(id)))].slice(0, 500);
}

function cleanCollection(value: unknown): WorkCollection | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<WorkCollection>;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 100) : '';
  const slug = typeof raw.slug === 'string' ? collectionSlug(raw.slug) : '';
  if (!name || !slug || typeof raw.id !== 'string') return null;
  return { id: raw.id, name, slug, includePublished: Boolean(raw.includePublished), videoIds: cleanIds(raw.videoIds), createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(), updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString() };
}

export async function getWorkCollections() {
  try {
    const parsed = JSON.parse(await fs.readFile(collectionsFile, 'utf8'));
    return Array.isArray(parsed) ? parsed.map(cleanCollection).filter((item): item is WorkCollection => Boolean(item)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
  } catch {
    return [];
  }
}

async function saveWorkCollections(collections: WorkCollection[]) {
  await fs.mkdir(path.dirname(collectionsFile), { recursive: true, mode: 0o700 });
  const temporary = `${collectionsFile}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(collections, null, 2), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, collectionsFile);
  await fs.chmod(collectionsFile, 0o600);
}

function validateInput(input: CollectionInput) {
  const name = input.name.trim().slice(0, 100);
  const slug = collectionSlug(input.slug || name);
  if (!name) throw new Error('Give this collection a name.');
  if (!slug) throw new Error('Use letters or numbers in the collection URL.');
  if (reservedSlugs.has(slug)) throw new Error('That URL is reserved for the main site. Try something more specific.');
  return { name, slug, includePublished: Boolean(input.includePublished) };
}

export async function createWorkCollection(input: CollectionInput) {
  const collections = await getWorkCollections();
  const details = validateInput(input);
  if (collections.some((collection) => collection.slug === details.slug)) throw new Error('That collection URL is already in use.');
  const now = new Date().toISOString();
  const collection: WorkCollection = { id: randomUUID(), ...details, videoIds: [], createdAt: now, updatedAt: now };
  await saveWorkCollections([collection, ...collections]);
  return collection;
}

export async function getWorkCollection(id: string) {
  return (await getWorkCollections()).find((collection) => collection.id === id) ?? null;
}

export async function getWorkCollectionBySlug(slug: string) {
  const normalized = collectionSlug(slug);
  return (await getWorkCollections()).find((collection) => collection.slug === normalized) ?? null;
}

export async function updateWorkCollection(id: string, input: Partial<CollectionInput> & { videoIds?: unknown }) {
  const collections = await getWorkCollections();
  const index = collections.findIndex((collection) => collection.id === id);
  if (index < 0) return null;
  const current = collections[index];
  const details = validateInput({ name: input.name ?? current.name, slug: input.slug ?? current.slug, includePublished: input.includePublished ?? current.includePublished });
  if (collections.some((collection) => collection.id !== id && collection.slug === details.slug)) throw new Error('That collection URL is already in use.');
  const next: WorkCollection = { ...current, ...details, ...(input.videoIds === undefined ? {} : { videoIds: cleanIds(input.videoIds) }), updatedAt: new Date().toISOString() };
  collections[index] = next;
  await saveWorkCollections(collections);
  return next;
}

export function collectionVideos(collection: WorkCollection, library: VimeoLibrary): Video[] {
  const byId = new Map(library.videos.map((video) => [video.id, video]));
  const published = collection.includePublished ? library.videos.filter((video) => video.libraryStatus === 'published') : [];
  const extras = collection.videoIds.map((id) => byId.get(id)).filter((video): video is VimeoLibraryVideo => Boolean(video));
  const seen = new Set<string>();
  return [...published, ...extras].filter((video) => !seen.has(video.id) && Boolean(seen.add(video.id))).map(toPublicVideo);
}

export type CollectionCandidate = Pick<VimeoLibraryVideo, 'id' | 'title' | 'customTitle' | 'client' | 'thumbnailUrl' | 'libraryStatus'>;
