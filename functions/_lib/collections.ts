import type { AdminEnvironment } from './admin';

type Row = { id: string; slug: string; value: string; created_at: string; updated_at: string };
export type Collection = { id: string; name: string; slug: string; includePublished: boolean; videoIds: string[]; createdAt: string; updatedAt: string };
const reserved = new Set(['admin', 'api', 'assets', 'case-studies', 'collections', 'connect-vimeo', 'favicon', 'library', 'login', 'robots', 'sitemap', 'work']);

export function normalizeSlug(value: string) {
  return value.toLowerCase().trim().split('/').map((part) => part.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('/').slice(0, 72);
}

function parse(row: Row): Collection | null {
  try {
    const raw = JSON.parse(row.value) as Partial<Collection>;
    if (!raw || typeof raw.name !== 'string') return null;
    return { id: row.id, name: raw.name, slug: row.slug, includePublished: Boolean(raw.includePublished), videoIds: Array.isArray(raw.videoIds) ? raw.videoIds.filter((id): id is string => typeof id === 'string') : [], createdAt: row.created_at, updatedAt: row.updated_at };
  } catch { return null; }
}

export async function readCollections(env: AdminEnvironment) {
  const rows = await env.TG_DATA.prepare('SELECT id, slug, value, created_at, updated_at FROM work_collections ORDER BY updated_at DESC').all<Row>();
  return rows.results.map(parse).filter((item): item is Collection => Boolean(item));
}

export async function createCollection(env: AdminEnvironment, input: { name: string; slug: string; includePublished: boolean }) {
  const name = input.name.trim().slice(0, 100);
  const slug = normalizeSlug(input.slug || name);
  if (!name) throw new Error('Give this collection a name.');
  if (!slug || reserved.has(slug.split('/')[0])) throw new Error('Use a more specific share URL.');
  const now = new Date().toISOString();
  const collection: Collection = { id: crypto.randomUUID(), name, slug, includePublished: input.includePublished, videoIds: [], createdAt: now, updatedAt: now };
  try {
    await env.TG_DATA.prepare('INSERT INTO work_collections (id, slug, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(collection.id, slug, JSON.stringify(collection), now, now).run();
  } catch { throw new Error('That share URL is already in use.'); }
  return collection;
}
