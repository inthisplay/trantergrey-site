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

function shortVideoSlug(existing: Set<string>) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const slug = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
    if (!existing.has(slug)) return slug;
  }
  throw new Error('Could not reserve a short video URL. Please try again.');
}

export async function createVideoProject(env: AdminEnvironment, input: { title?: unknown; slug?: unknown; client?: unknown; description?: unknown; collectionIds?: unknown; variants?: Array<{ assetId?: unknown; label?: unknown }>; mergeExisting?: unknown }, assets: MuxLibraryAsset[]) {
  const store = await readVideoProjectStore(env);
  const title = text(input.title, 160); const requestedSlug = text(input.slug, 100); const slug = requestedSlug ? videoProjectSlug(requestedSlug) : shortVideoSlug(new Set(store.projects.map((item) => item.slug)));
  if (!title || !slug) throw new Error('Give this video project a title and usable URL.');
  if (store.projects.some((item) => item.slug === slug)) throw new Error('That video URL is already in use.');
  const byId = new Map(assets.map((item) => [item.id, item])); const seen = new Set<string>();
  const variants = (input.variants ?? []).map((raw, index) => { const id = assetId(raw.assetId); const asset = byId.get(id); if (!asset || seen.has(id)) return null; seen.add(id); return { assetId: id, label: text(raw.label, 30) || ratioLabel(asset.aspectRatio), aspectRatio: asset.aspectRatio, order: index } satisfies VideoProjectVariant; }).filter((item): item is VideoProjectVariant => Boolean(item));
  if (!variants.length) throw new Error('Choose at least one Mux asset for this project.');
  const selectedIds = new Set(variants.map((item) => item.assetId));
  const conflicts = store.projects.filter((project) => project.variants.some((variant) => selectedIds.has(variant.assetId)));
  if (conflicts.length && input.mergeExisting === true) {
    if (conflicts.some((project) => project.variants.some((variant) => !selectedIds.has(variant.assetId)))) throw new Error('A selected asset belongs to a page with other video variants. Manage that page before regrouping it.');
    await Promise.all(conflicts.map((project) => env.TG_DATA.prepare('DELETE FROM mux_video_projects WHERE id = ?').bind(project.id).run()));
  } else if (conflicts.length) throw new Error('One or more selected assets already belong to a video page.');
  if (variants.some((item) => { const asset = byId.get(item.assetId); return !asset?.playbackId || asset.playbackPolicy !== 'public'; })) throw new Error('Every selected asset needs a public Mux playback ID.');
  const validCollections = new Set(store.collections.map((item) => item.id)); const now = new Date().toISOString();
  const project: VideoProject = { id: crypto.randomUUID(), title, slug, client: text(input.client, 120) || null, description: text(input.description, 1200) || null, variants, collectionIds: ids(input.collectionIds).filter((id) => validCollections.has(id)), createdAt: now, updatedAt: now };
  await saveProject(env, project); return project;
}

export async function updateVideoProject(env: AdminEnvironment, rawId: unknown, patch: { title?: unknown }) {
  const id = text(rawId, 100);
  const store = await readVideoProjectStore(env);
  const existing = store.projects.find((item) => item.id === id);
  if (!existing) throw new Error('That video page could not be found.');
  const title = 'title' in patch ? text(patch.title, 160) : existing.title;
  if (!title) throw new Error('Give this ratio group a title.');
  const project = { ...existing, title, updatedAt: new Date().toISOString() };
  await saveProject(env, project);
  return project;
}

export async function replaceVideoAsset(env: AdminEnvironment, previousAsset: MuxLibraryAsset, replacementAsset: MuxLibraryAsset) {
  if (!replacementAsset.playbackId || replacementAsset.playbackPolicy !== 'public') throw new Error('The replacement video is still processing in Mux. Try again once it is ready.');
  const [store, metadata] = await Promise.all([readVideoProjectStore(env), readMuxMetadata(env)]);
  const now = new Date().toISOString();
  const saved = metadata[previousAsset.id];
  const project = store.projects.find((item) => item.variants.some((variant) => variant.assetId === previousAsset.id));
  const variants = project
    ? project.variants.map((variant) => variant.assetId === previousAsset.id ? { ...variant, assetId: replacementAsset.id, aspectRatio: replacementAsset.aspectRatio } : variant)
    : [{ assetId: replacementAsset.id, label: ratioLabel(replacementAsset.aspectRatio), aspectRatio: replacementAsset.aspectRatio, order: 0 }];
  const nextProject: VideoProject = project ?? {
    id: crypto.randomUUID(),
    title: saved?.title || previousAsset.title,
    slug: shortVideoSlug(new Set(store.projects.map((item) => item.slug))),
    client: saved?.client || null,
    description: null,
    variants,
    collectionIds: [],
    createdAt: now,
    updatedAt: now,
  };
  await patchMuxMetadata(env, replacementAsset.id, {
    title: saved?.title || previousAsset.title,
    client: saved?.client || '',
    tags: saved?.tags || [],
    status: saved?.status || 'unreviewed',
    thumbnailTime: saved?.thumbnailTime ?? 1,
    downloadsEnabled: saved?.downloadsEnabled ?? true,
  });
  await saveProject(env, project ? { ...nextProject, variants, updatedAt: now } : nextProject);
  return project ? { ...nextProject, variants, updatedAt: now } : nextProject;
}

export async function assignShortVideoUrls(env: AdminEnvironment, assets: MuxLibraryAsset[]) {
  const [store, metadata] = await Promise.all([readVideoProjectStore(env), readMuxMetadata(env)]);
  const used = new Set(store.projects.map((item) => item.slug));
  const now = new Date().toISOString();
  const updates: VideoProject[] = [];
  const assigned = new Set(store.projects.flatMap((item) => item.variants.map((variant) => variant.assetId)));
  for (const project of store.projects) {
    if (/^[A-Za-z0-9]{4}$/.test(project.slug)) continue;
    const slug = shortVideoSlug(used); used.add(slug);
    updates.push({ ...project, slug, legacySlugs: [...new Set([...(project.legacySlugs ?? []), project.slug])], updatedAt: now });
  }
  const uploadGracePeriod = Date.now() - 5 * 60 * 1000;
  for (const asset of assets) {
    if (assigned.has(asset.id) || !asset.playbackId || asset.playbackPolicy !== 'public') continue;
    if (asset.createdAt && new Date(asset.createdAt).getTime() > uploadGracePeriod) continue;
    const slug = shortVideoSlug(used); used.add(slug);
    const saved = metadata[asset.id];
    updates.push({ id: crypto.randomUUID(), title: saved?.title || asset.title, slug, client: saved?.client || null, description: null, variants: [{ assetId: asset.id, label: ratioLabel(asset.aspectRatio), aspectRatio: asset.aspectRatio, order: 0 }], collectionIds: [], createdAt: now, updatedAt: now });
  }
  for (let index = 0; index < updates.length; index += 20) await Promise.all(updates.slice(index, index + 20).map((project) => saveProject(env, project)));
  return { updated: updates.length };
}

export async function deleteVideoProject(env: AdminEnvironment, rawId: unknown) {
  const id = text(rawId, 100); const store = await readVideoProjectStore(env); const project = store.projects.find((item) => item.id === id);
  if (!project) throw new Error('That video page could not be found.');
  await env.TG_DATA.prepare('DELETE FROM mux_video_projects WHERE id = ?').bind(id).run(); return project;
}

export async function deleteVideoCollection(env: AdminEnvironment, rawId: unknown) {
  const id = text(rawId, 100);
  const store = await readVideoProjectStore(env);
  const collection = store.collections.find((item) => item.id === id);
  if (!collection) throw new Error('That collection could not be found.');
  const now = new Date().toISOString();
  for (const project of store.projects) {
    if (!project.collectionIds.includes(id)) continue;
    await saveProject(env, { ...project, collectionIds: project.collectionIds.filter((collectionId) => collectionId !== id), updatedAt: now });
  }
  await env.TG_DATA.prepare('DELETE FROM mux_video_collections WHERE id = ?').bind(id).run();
  return collection;
}

export async function detachAssetsFromVideoPages(env: AdminEnvironment, assetIds: string[]) {
  const selected = new Set(assetIds);
  const store = await readVideoProjectStore(env);
  const now = new Date().toISOString();
  const updatedProjectIds: string[] = [];
  const deletedProjectIds: string[] = [];
  const affectedCollectionIds = new Set<string>();

  for (const project of store.projects) {
    if (!project.variants.some((variant) => selected.has(variant.assetId))) continue;
    project.collectionIds.forEach((id) => affectedCollectionIds.add(id));
    const variants = project.variants.filter((variant) => !selected.has(variant.assetId));
    if (variants.length) {
      await saveProject(env, { ...project, variants, updatedAt: now });
      updatedProjectIds.push(project.id);
    } else {
      await env.TG_DATA.prepare('DELETE FROM mux_video_projects WHERE id = ?').bind(project.id).run();
      deletedProjectIds.push(project.id);
    }
  }

  const remainingProjects = store.projects.filter((project) => !deletedProjectIds.includes(project.id));
  const deletedCollectionIds: string[] = [];
  for (const collectionId of affectedCollectionIds) {
    if (remainingProjects.some((project) => project.collectionIds.includes(collectionId))) continue;
    await env.TG_DATA.prepare('DELETE FROM mux_video_collections WHERE id = ?').bind(collectionId).run();
    deletedCollectionIds.push(collectionId);
  }
  return { updatedProjectIds, deletedProjectIds, deletedCollectionIds };
}

export async function createVideoCollection(env: AdminEnvironment, input: { name?: unknown; slug?: unknown; description?: unknown; assetIds?: unknown; clientsByAssetId?: unknown; allowEmpty?: unknown }, assets: MuxLibraryAsset[]) {
  const store = await readVideoProjectStore(env); const name = text(input.name, 120); const slug = videoProjectSlug(text(input.slug, 100) || name);
  if (!name || !slug) throw new Error('Give this collection a name and usable URL.');
  const selectedIds = ids(input.assetIds); if (!selectedIds.length && input.allowEmpty !== true) throw new Error('Choose at least one Mux asset for this collection.');
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
    const projectSlug = shortVideoSlug(used); used.add(projectSlug);
    await saveProject(env, { id: crypto.randomUUID(), title: asset.title, slug: projectSlug, client: text(clients[asset.id], 120) || null, description: null, variants: [{ assetId: asset.id, label: ratioLabel(asset.aspectRatio), aspectRatio: asset.aspectRatio, order: 0 }], collectionIds: [collection.id], createdAt: now, updatedAt: now });
  }
  return { collection, ...(await readVideoProjectStore(env)), reused: Boolean(existing) };
}

export async function updateVideoCollection(env: AdminEnvironment, rawId: unknown, patch: { name?: unknown; tags?: unknown }) {
  const id = text(rawId, 100); const store = await readVideoProjectStore(env); const existing = store.collections.find((item) => item.id === id); if (!existing) throw new Error('That collection could not be found.');
  const name = 'name' in patch ? text(patch.name, 160) : existing.name;
  if (!name) throw new Error('Give the collection a name.');
  const collection = { ...existing, name, tags: 'tags' in patch ? tags(patch.tags) : existing.tags, updatedAt: new Date().toISOString() }; await saveCollection(env, collection); return collection;
}
