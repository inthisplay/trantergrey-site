import type { AdminEnvironment } from './admin';
import type { VideoProject, VideoProjectCollection, VideoProjectVariant } from '../../lib/video-projects-shared';
import { ratioLabel, videoProjectSlug } from '../../lib/video-projects-shared';
import type { MuxLibraryAsset } from '../../lib/mux-shared';

export type MuxLibraryStatus = 'unreviewed' | 'published' | 'hidden';
export type MuxAssetMetadata = { client: string | null; title: string | null; tags: string[] | null; status: MuxLibraryStatus | null; thumbnailTime: number | null; downloadsEnabled: boolean | null };
export type MuxMetadataMap = Record<string, MuxAssetMetadata>;
export type VideoProjectStore = { projects: VideoProject[]; collections: VideoProjectCollection[] };

type MetadataRow = { asset_id: string; client: string | null; title: string | null; tags: string | null; status: MuxLibraryStatus | null; thumbnail_time: number | null; downloads_enabled: number | null };
type JsonRow = { value: string };

function text(value: unknown, maximum: number) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : ''; }
function assetId(value: unknown) { return typeof value === 'string' && /^[A-Za-z0-9]+$/.test(value) ? value : ''; }
function tags(value: unknown) { const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []; return [...new Set(raw.map((item) => text(item, 80)).filter(Boolean))].slice(0, 50); }
function status(value: unknown): MuxLibraryStatus | null { return value === 'published' || value === 'hidden' || value === 'unreviewed' ? value : null; }
function ids(value: unknown) { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && /^[A-Za-z0-9-]+$/.test(item)))] : []; }

export async function readMuxMetadata(env: AdminEnvironment): Promise<MuxMetadataMap> {
  const rows = await env.TG_DATA.prepare('SELECT asset_id, client, title, tags, status, thumbnail_time, downloads_enabled FROM mux_asset_metadata').all<MetadataRow>();
  return Object.fromEntries(rows.results.map((row) => [row.asset_id, { client: row.client, title: row.title, tags: row.tags === null ? null : tags(JSON.parse(row.tags)), status: status(row.status), thumbnailTime: row.thumbnail_time, downloadsEnabled: row.downloads_enabled === null ? null : row.downloads_enabled !== 0 }]));
}

export async function patchMuxMetadata(env: AdminEnvironment, rawId: unknown, patch: { client?: unknown; title?: unknown; tags?: unknown; status?: unknown; thumbnailTime?: unknown; downloadsEnabled?: unknown }) {
  const id = assetId(rawId);
  if (!id) throw new Error('A valid Mux asset ID is required.');
  const current = (await readMuxMetadata(env))[id] ?? { client: null, title: null, tags: null, status: null, thumbnailTime: null, downloadsEnabled: null };
  const next: MuxAssetMetadata = { ...current };
  if ('client' in patch) next.client = text(patch.client, 120) || null;
  if ('title' in patch) next.title = text(patch.title, 240) || null;
  if ('tags' in patch) next.tags = tags(patch.tags);
  if ('status' in patch) { const value = status(patch.status); if (!value) throw new Error('Choose a valid library status.'); next.status = value; }
  if ('thumbnailTime' in patch) { const value = Number(patch.thumbnailTime); if (!Number.isFinite(value) || value < 0) throw new Error('Enter a valid thumbnail time.'); next.thumbnailTime = Math.round(value * 1000) / 1000; }
  if ('downloadsEnabled' in patch) { if (typeof patch.downloadsEnabled !== 'boolean') throw new Error('Choose a valid download setting.'); next.downloadsEnabled = patch.downloadsEnabled; }
  await env.TG_DATA.prepare(`INSERT INTO mux_asset_metadata (asset_id, client, title, tags, status, thumbnail_time, downloads_enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(asset_id) DO UPDATE SET client=excluded.client, title=excluded.title, tags=excluded.tags, status=excluded.status, thumbnail_time=excluded.thumbnail_time, downloads_enabled=excluded.downloads_enabled, updated_at=excluded.updated_at`)
    .bind(id, next.client, next.title, JSON.stringify(next.tags), next.status, next.thumbnailTime, next.downloadsEnabled ? 1 : 0, new Date().toISOString()).run();
  return {
    assetId: id,
    ...('title' in patch ? { title: next.title } : {}),
    ...('tags' in patch ? { tags: next.tags ?? [] } : {}),
    ...('status' in patch ? { status: next.status } : {}),
    ...('thumbnailTime' in patch ? { thumbnailTime: next.thumbnailTime } : {}),
    ...('downloadsEnabled' in patch ? { downloadsEnabled: next.downloadsEnabled } : {}),
  };
}

export async function deleteMuxMetadata(env: AdminEnvironment, assetIds: string[]) {
  for (const id of assetIds) await env.TG_DATA.prepare('DELETE FROM mux_asset_metadata WHERE asset_id = ?').bind(id).run();
}

export async function readVideoProjectStore(env: AdminEnvironment): Promise<VideoProjectStore> {
  const [projectRows, collectionRows] = await Promise.all([
    env.TG_DATA.prepare('SELECT value FROM mux_video_projects ORDER BY updated_at DESC').all<JsonRow>(),
    env.TG_DATA.prepare('SELECT value FROM mux_video_collections ORDER BY updated_at DESC').all<JsonRow>(),
  ]);
  return {
    projects: projectRows.results.flatMap((row) => { try { return [JSON.parse(row.value) as VideoProject]; } catch { return []; } }),
    collections: collectionRows.results.flatMap((row) => { try { return [JSON.parse(row.value) as VideoProjectCollection]; } catch { return []; } }),
  };
}

async function saveProject(env: AdminEnvironment, project: VideoProject) {
  await env.TG_DATA.prepare(`INSERT INTO mux_video_projects (id, slug, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, value=excluded.value, updated_at=excluded.updated_at`)
    .bind(project.id, project.slug, JSON.stringify(project), project.createdAt, project.updatedAt).run();
}

async function saveCollection(env: AdminEnvironment, collection: VideoProjectCollection) {
  await env.TG_DATA.prepare(`INSERT INTO mux_video_collections (id, slug, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, value=excluded.value, updated_at=excluded.updated_at`)
    .bind(collection.id, collection.slug, JSON.stringify(collection), collection.createdAt, collection.updatedAt).run();
}

export async function createVideoProject(env: AdminEnvironment, input: { title?: unknown; slug?: unknown; client?: unknown; description?: unknown; collectionIds?: unknown; variants?: Array<{ assetId?: unknown; label?: unknown }> }, assets: MuxLibraryAsset[]) {
  const store = await readVideoProjectStore(env);
  const title = text(input.title, 160); const slug = videoProjectSlug(text(input.slug, 100) || title);
  if (!title || !slug) throw new Error('Give this video project a title and usable URL.');
  if (store.projects.some((item) => item.slug === slug)) throw new Error('That video URL is already in use.');
  const byId = new Map(assets.map((item) => [item.id, item])); const seen = new Set<string>();
  const variants = (input.variants ?? []).map((raw, index) => { const id = assetId(raw.assetId); const asset = byId.get(id); if (!asset || seen.has(id)) return null; seen.add(id); return { assetId: id, label: text(raw.label, 30) || ratioLabel(asset.aspectRatio), aspectRatio: asset.aspectRatio, order: index } satisfies VideoProjectVariant; }).filter((item): item is VideoProjectVariant => Boolean(item));
  if (!variants.length) throw new Error('Choose at least one Mux asset for this project.');
  const assigned = new Set(store.projects.flatMap((item) => item.variants.map((variant) => variant.assetId)));
  if (variants.some((item) => assigned.has(item.assetId))) throw new Error('One or more selected assets already belong to a video page.');
  if (variants.some((item) => { const asset = byId.get(item.assetId); return !asset?.playbackId || asset.playbackPolicy !== 'public'; })) throw new Error('Every selected asset needs a public Mux playback ID.');
  const validCollections = new Set(store.collections.map((item) => item.id)); const now = new Date().toISOString();
  const project: VideoProject = { id: crypto.randomUUID(), title, slug, client: text(input.client, 120) || null, description: text(input.description, 1200) || null, variants, collectionIds: ids(input.collectionIds).filter((id) => validCollections.has(id)), createdAt: now, updatedAt: now };
  await saveProject(env, project); return project;
}

export async function deleteVideoProject(env: AdminEnvironment, rawId: unknown) {
  const id = text(rawId, 100); const store = await readVideoProjectStore(env); const project = store.projects.find((item) => item.id === id);
  if (!project) throw new Error('That video page could not be found.');
  await env.TG_DATA.prepare('DELETE FROM mux_video_projects WHERE id = ?').bind(id).run(); return project;
}

export async function createVideoCollection(env: AdminEnvironment, input: { name?: unknown; slug?: unknown; description?: unknown; assetIds?: unknown; clientsByAssetId?: unknown }, assets: MuxLibraryAsset[]) {
  const store = await readVideoProjectStore(env); const name = text(input.name, 120); const slug = videoProjectSlug(text(input.slug, 100) || name);
  if (!name || !slug) throw new Error('Give this collection a name and usable URL.');
  const selectedIds = ids(input.assetIds); if (!selectedIds.length) throw new Error('Choose at least one Mux asset for this collection.');
  const byId = new Map(assets.map((item) => [item.id, item])); const selected = selectedIds.map((id) => byId.get(id)).filter((item): item is MuxLibraryAsset => Boolean(item));
  if (selected.length !== selectedIds.length) throw new Error('One or more selected Mux assets could not be found.');
  const now = new Date().toISOString(); const existing = store.collections.find((item) => item.slug === slug);
  const collection: VideoProjectCollection = existing ? { ...existing, name, description: text(input.description, 600) || existing.description, updatedAt: now } : { id: crypto.randomUUID(), name, slug, description: text(input.description, 600) || null, tags: [], createdAt: now, updatedAt: now };
  await saveCollection(env, collection);
  const selectedSet = new Set(selectedIds); const attached = new Set<string>();
  for (const project of store.projects) {
    if (!project.variants.some((variant) => selectedSet.has(variant.assetId))) continue;
    project.variants.forEach((variant) => { if (selectedSet.has(variant.assetId)) attached.add(variant.assetId); });
    if (!project.collectionIds.includes(collection.id)) await saveProject(env, { ...project, collectionIds: [...project.collectionIds, collection.id], updatedAt: now });
  }
  const clients = input.clientsByAssetId && typeof input.clientsByAssetId === 'object' ? input.clientsByAssetId as Record<string, unknown> : {};
  const used = new Set(store.projects.map((item) => item.slug));
  for (const asset of selected.filter((item) => !attached.has(item.id))) {
    const base = videoProjectSlug(asset.title) || `video-${asset.id.slice(0, 8).toLowerCase()}`; let projectSlug = base; let suffix = 2; while (used.has(projectSlug)) projectSlug = `${base}-${suffix++}`; used.add(projectSlug);
    await saveProject(env, { id: crypto.randomUUID(), title: asset.title, slug: projectSlug, client: text(clients[asset.id], 120) || null, description: null, variants: [{ assetId: asset.id, label: ratioLabel(asset.aspectRatio), aspectRatio: asset.aspectRatio, order: 0 }], collectionIds: [collection.id], createdAt: now, updatedAt: now });
  }
  return { collection, ...(await readVideoProjectStore(env)), reused: Boolean(existing) };
}

export async function updateVideoCollection(env: AdminEnvironment, rawId: unknown, patch: { tags?: unknown }) {
  const id = text(rawId, 100); const store = await readVideoProjectStore(env); const existing = store.collections.find((item) => item.id === id); if (!existing) throw new Error('That collection could not be found.');
  const collection = { ...existing, tags: 'tags' in patch ? tags(patch.tags) : existing.tags, updatedAt: new Date().toISOString() }; await saveCollection(env, collection); return collection;
}
