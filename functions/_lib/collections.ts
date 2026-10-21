import type { AdminEnvironment } from './admin';

type Row = { id: string; slug: string; value: string; created_at: string; updated_at: string };
export type Collection = { id: string; name: string; slug: string; includePublished: boolean; isPrivate: boolean; videoIds: string[]; createdAt: string; updatedAt: string };
const reserved = new Set(['admin', 'api', 'assets', 'case-studies', 'collections', 'connect-vimeo', 'favicon', 'library', 'login', 'robots', 'sitemap', 'work']);

export function normalizeSlug(value: string) {
  return value.toLowerCase().trim().split('/').map((part) => part.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('/').slice(0, 72);
}

function parse(row: Row): Collection | null {
  try {
    const raw = JSON.parse(row.value) as Partial<Collection>;
    if (!raw || typeof raw.name !== 'string') return null;
    return { id: row.id, name: raw.name, slug: row.slug, includePublished: Boolean(raw.includePublished), isPrivate: raw.isPrivate === true, videoIds: Array.isArray(raw.videoIds) ? raw.videoIds.filter((id): id is string => typeof id === 'string') : [], createdAt: row.created_at, updatedAt: row.updated_at };
  } catch { return null; }
}

export async function readCollections(env: AdminEnvironment) {
  const rows = await env.TG_DATA.prepare('SELECT id, slug, value, created_at, updated_at FROM work_collections ORDER BY updated_at DESC').all<Row>();
  return rows.results.map(parse).filter((item): item is Collection => Boolean(item));
}

export async function readCollection(env: AdminEnvironment, id: string) {
  const row = await env.TG_DATA.prepare('SELECT id, slug, value, created_at, updated_at FROM work_collections WHERE id = ?').bind(id).first<Row>();
  return row ? parse(row) : null;
}

export async function createCollection(env: AdminEnvironment, input: { name: string; slug: string; includePublished: boolean; isPrivate: boolean }) {
  const name = input.name.trim().slice(0, 100);
  const slug = normalizeSlug(input.slug || name);
  if (!name) throw new Error('Give this collection a name.');
  if (!slug || reserved.has(slug.split('/')[0])) throw new Error('Use a more specific share URL.');
  const now = new Date().toISOString();
  const collection: Collection = { id: crypto.randomUUID(), name, slug, includePublished: input.includePublished, isPrivate: input.isPrivate, videoIds: [], createdAt: now, updatedAt: now };
  try {
    await env.TG_DATA.prepare('INSERT INTO work_collections (id, slug, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(collection.id, slug, JSON.stringify(collection), now, now).run();
  } catch { throw new Error('That share URL is already in use.'); }
  return collection;
}

export async function updateCollection(env: AdminEnvironment, id: string, input: { name?: unknown; videoIds?: unknown; isPrivate?: unknown }) {
  const collection = await readCollection(env, id);
  if (!collection) return null;
  let name = collection.name;
  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim()) throw new Error('Give this collection a name.');
    name = input.name.trim().slice(0, 100);
  }
  let videoIds = collection.videoIds;
  if (input.videoIds !== undefined) {
    if (!Array.isArray(input.videoIds) || input.videoIds.some((videoId) => typeof videoId !== 'string')) throw new Error('Choose valid videos from the library.');
    videoIds = [...new Set(input.videoIds.map((videoId) => videoId.trim()).filter(Boolean))];
    if (videoIds.length > 5000 || videoIds.some((videoId) => videoId.length > 80)) throw new Error('That selection is too large.');
  }
  if (input.isPrivate !== undefined && typeof input.isPrivate !== 'boolean') throw new Error('Choose whether this collection appears in the directory.');
  const updatedAt = new Date().toISOString();
  const next: Collection = { ...collection, name, videoIds, isPrivate: typeof input.isPrivate === 'boolean' ? input.isPrivate : collection.isPrivate, updatedAt };
  await env.TG_DATA.prepare('UPDATE work_collections SET value = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(next), updatedAt, id).run();
  return next;
}
