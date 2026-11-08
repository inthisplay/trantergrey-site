import 'server-only';

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dataDirectory } from './data-directory';
import type { MuxLibraryAsset } from './mux-api';
import { ratioLabel, videoProjectSlug, type VideoProject, type VideoProjectCollection, type VideoProjectVariant } from './video-projects-shared';
export { ratioLabel, videoProjectSlug } from './video-projects-shared';
export type { VideoProject, VideoProjectCollection, VideoProjectVariant } from './video-projects-shared';

type VideoProjectStore = {
  projects: VideoProject[];
  collections: VideoProjectCollection[];
};

const storeFile = path.join(dataDirectory, 'mux-video-projects.json');

function cleanString(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function cleanRecordIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && /^[A-Za-z0-9-]+$/.test(item)))];
}

function cleanTags(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(values.map((tag) => cleanString(tag, 80).replace(/\s+/g, ' ')).filter(Boolean))].slice(0, 50);
}

function cleanCollection(value: unknown): VideoProjectCollection | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<VideoProjectCollection>;
  const id = cleanString(raw.id, 100);
  const name = cleanString(raw.name, 120);
  const slug = videoProjectSlug(cleanString(raw.slug, 100));
  if (!id || !name || !slug) return null;
  return {
    id,
    name,
    slug,
    description: cleanString(raw.description, 600) || null,
    tags: cleanTags(raw.tags),
    createdAt: cleanString(raw.createdAt, 40) || new Date(0).toISOString(),
    updatedAt: cleanString(raw.updatedAt, 40) || new Date(0).toISOString(),
  };
}

function cleanVariant(value: unknown, index: number): VideoProjectVariant | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<VideoProjectVariant>;
  const assetId = cleanString(raw.assetId, 100);
  if (!assetId || !/^[A-Za-z0-9]+$/.test(assetId)) return null;
  return {
    assetId,
    label: cleanString(raw.label, 30) || 'Main',
    aspectRatio: cleanString(raw.aspectRatio, 30) || null,
    order: Number.isFinite(raw.order) ? Number(raw.order) : index,
  };
}

function cleanProject(value: unknown): VideoProject | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<VideoProject>;
  const id = cleanString(raw.id, 100);
  const title = cleanString(raw.title, 160);
  const slug = videoProjectSlug(cleanString(raw.slug, 100));
  const variants = Array.isArray(raw.variants) ? raw.variants.map(cleanVariant).filter((item): item is VideoProjectVariant => Boolean(item)).sort((a, b) => a.order - b.order) : [];
  if (!id || !title || !slug || !variants.length) return null;
  return {
    id,
    title,
    slug,
    client: cleanString(raw.client, 120) || null,
    description: cleanString(raw.description, 1200) || null,
    variants,
    collectionIds: cleanRecordIds(raw.collectionIds),
    createdAt: cleanString(raw.createdAt, 40) || new Date(0).toISOString(),
    updatedAt: cleanString(raw.updatedAt, 40) || new Date(0).toISOString(),
  };
}

export async function getVideoProjectStore(): Promise<VideoProjectStore> {
  try {
    const parsed = JSON.parse(await fs.readFile(storeFile, 'utf8')) as Partial<VideoProjectStore>;
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects.map(cleanProject).filter((item): item is VideoProject => Boolean(item)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [],
      collections: Array.isArray(parsed.collections) ? parsed.collections.map(cleanCollection).filter((item): item is VideoProjectCollection => Boolean(item)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [],
    };
  } catch {
    return { projects: [], collections: [] };
  }
}

async function saveStore(store: VideoProjectStore) {
  await fs.mkdir(path.dirname(storeFile), { recursive: true, mode: 0o700 });
  const temporary = `${storeFile}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, storeFile);
  await fs.chmod(storeFile, 0o600);
}

export async function createVideoProjectCollection(input: {
  name: unknown;
  slug?: unknown;
  description?: unknown;
  assetIds?: unknown;
  clientsByAssetId?: unknown;
}, assets: MuxLibraryAsset[]) {
  const store = await getVideoProjectStore();
  const name = cleanString(input.name, 120);
  const slug = videoProjectSlug(cleanString(input.slug, 100) || name);
  if (!name) throw new Error('Give this collection a name.');
  if (!slug) throw new Error('Give this collection a usable URL.');

  const assetIds = cleanRecordIds(input.assetIds);
  if (!assetIds.length) throw new Error('Choose at least one Mux asset for this collection.');

  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const selectedAssets = assetIds.map((assetId) => assetsById.get(assetId)).filter((asset): asset is MuxLibraryAsset => Boolean(asset));
  if (selectedAssets.length !== assetIds.length) throw new Error('One or more selected Mux assets could not be found.');
  if (selectedAssets.some((asset) => !asset.playbackId || asset.playbackPolicy !== 'public')) {
    throw new Error('Every selected asset needs a public Mux playback ID.');
  }

  const clientsByAssetId = input.clientsByAssetId && typeof input.clientsByAssetId === 'object'
    ? input.clientsByAssetId as Record<string, unknown>
    : {};
  const now = new Date().toISOString();
  const existingCollection = store.collections.find((item) => item.slug === slug);
  const collection: VideoProjectCollection = existingCollection
    ? { ...existingCollection, name, description: cleanString(input.description, 600) || existingCollection.description, updatedAt: now }
    : { id: randomUUID(), name, slug, description: cleanString(input.description, 600) || null, tags: [], createdAt: now, updatedAt: now };

  const usedSlugs = new Set(store.projects.map((project) => project.slug));
  const selectedIds = new Set(assetIds);
  const attachedIds = new Set<string>();
  const updatedProjects = store.projects.map((project) => {
    if (!project.variants.some((variant) => selectedIds.has(variant.assetId))) return project;
    project.variants.forEach((variant) => {
      if (selectedIds.has(variant.assetId)) attachedIds.add(variant.assetId);
    });
    if (project.collectionIds.includes(collection.id)) return project;
    return { ...project, collectionIds: [...project.collectionIds, collection.id], updatedAt: now };
  });

  const newProjects = selectedAssets.filter((asset) => !attachedIds.has(asset.id)).map((asset) => {
    const baseSlug = videoProjectSlug(asset.title) || `video-${asset.id.slice(0, 8).toLowerCase()}`;
    let projectSlug = baseSlug;
    let suffix = 2;
    while (usedSlugs.has(projectSlug)) projectSlug = `${baseSlug}-${suffix++}`;
    usedSlugs.add(projectSlug);
    return {
      id: randomUUID(),
      title: asset.title,
      slug: projectSlug,
      client: cleanString(clientsByAssetId[asset.id], 120) || asset.historicClient || null,
      description: null,
      variants: [{ assetId: asset.id, label: ratioLabel(asset.aspectRatio), aspectRatio: asset.aspectRatio, order: 0 }],
      collectionIds: [collection.id],
      createdAt: now,
      updatedAt: now,
    } satisfies VideoProject;
  });

  const collections = existingCollection
    ? store.collections.map((item) => item.id === collection.id ? collection : item)
    : [collection, ...store.collections];
  const projects = [...newProjects, ...updatedProjects].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  await saveStore({ projects, collections });
  return { collection, projects, collections, reused: Boolean(existingCollection) };
}

export async function createVideoProject(input: {
  title: unknown;
  slug?: unknown;
  client?: unknown;
  description?: unknown;
  collectionIds?: unknown;
  variants?: Array<{ assetId?: unknown; label?: unknown }>;
}, assets: MuxLibraryAsset[]) {
  const store = await getVideoProjectStore();
  const title = cleanString(input.title, 160);
  const slug = videoProjectSlug(cleanString(input.slug, 100) || title);
  if (!title) throw new Error('Give this video project a title.');
  if (!slug) throw new Error('Give this video project a usable URL.');
  if (store.projects.some((project) => project.slug === slug)) throw new Error('That video URL is already in use.');

  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const seen = new Set<string>();
  const variants = (input.variants ?? []).map((variant, index) => {
    const assetId = cleanString(variant.assetId, 100);
    const asset = assetsById.get(assetId);
    if (!asset || seen.has(assetId)) return null;
    seen.add(assetId);
    return { assetId, label: cleanString(variant.label, 30) || ratioLabel(asset.aspectRatio), aspectRatio: asset.aspectRatio, order: index };
  }).filter((variant): variant is VideoProjectVariant => Boolean(variant));
  if (!variants.length) throw new Error('Choose at least one Mux asset for this project.');
  const assignedAssetIds = new Set(store.projects.flatMap((project) => project.variants.map((variant) => variant.assetId)));
  if (variants.some((variant) => assignedAssetIds.has(variant.assetId))) throw new Error('One or more selected assets already belong to a video page.');
  if (variants.some((variant) => {
    const asset = assetsById.get(variant.assetId);
    return !asset?.playbackId || asset.playbackPolicy !== 'public';
  })) throw new Error('Every selected asset needs a public Mux playback ID.');

  const validCollectionIds = new Set(store.collections.map((collection) => collection.id));
  const collectionIds = cleanRecordIds(input.collectionIds).filter((id) => validCollectionIds.has(id));
  const now = new Date().toISOString();
  const project: VideoProject = {
    id: randomUUID(), title, slug, client: cleanString(input.client, 120) || null, description: cleanString(input.description, 1200) || null,
    variants, collectionIds, createdAt: now, updatedAt: now,
  };
  await saveStore({ ...store, projects: [project, ...store.projects] });
  return project;
}

export async function deleteVideoProject(projectIdValue: unknown) {
  const projectId = cleanString(projectIdValue, 100);
  if (!projectId) throw new Error('A valid video page is required.');
  const store = await getVideoProjectStore();
  const project = store.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('That video page could not be found.');
  await saveStore({ ...store, projects: store.projects.filter((item) => item.id !== projectId) });
  return project;
}

export async function getVideoProjectBySlug(slug: string) {
  const normalized = videoProjectSlug(slug);
  return (await getVideoProjectStore()).projects.find((project) => project.slug === normalized) ?? null;
}

export async function getVideoProjectCollectionBySlug(slug: string) {
  const normalized = videoProjectSlug(slug);
  return (await getVideoProjectStore()).collections.find((collection) => collection.slug === normalized) ?? null;
}

export async function updateVideoProjectCollection(collectionIdValue: unknown, patch: { tags?: unknown }) {
  const collectionId = cleanString(collectionIdValue, 100);
  if (!collectionId) throw new Error('A valid collection is required.');
  const store = await getVideoProjectStore();
  const existing = store.collections.find((collection) => collection.id === collectionId);
  if (!existing) throw new Error('That collection could not be found.');
  const collection: VideoProjectCollection = {
    ...existing,
    tags: 'tags' in patch ? cleanTags(patch.tags) : existing.tags,
    updatedAt: new Date().toISOString(),
  };
  await saveStore({ ...store, collections: store.collections.map((item) => item.id === collection.id ? collection : item) });
  return collection;
}
