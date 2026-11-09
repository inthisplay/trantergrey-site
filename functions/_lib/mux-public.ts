import type { AdminEnvironment } from './admin';
import { getMuxLibraryAsset, getMuxLibraryAssets, muxSourceThumbnailUrl, muxThumbnailUrl } from './mux';
import { readMuxMetadata, readVideoProjectStore } from './mux-state';
import { ratioLabel } from '../../lib/video-projects-shared';

export type PublicVariant = { assetId: string; label: string; aspectRatio: string | null; playbackId: string; thumbnailUrl: string | null; duration: number; downloadsEnabled: boolean; maxResolution: string | null };

function publicVariant(asset: Awaited<ReturnType<typeof getMuxLibraryAsset>>, label: string, metadata: Awaited<ReturnType<typeof readMuxMetadata>>): PublicVariant | null {
  if (!asset.playbackId || asset.playbackPolicy !== 'public') return null;
  const saved = metadata[asset.id];
  return { assetId: asset.id, label, aspectRatio: asset.aspectRatio, playbackId: asset.playbackId, thumbnailUrl: saved?.thumbnailTime === null || saved?.thumbnailTime === undefined ? asset.thumbnailUrl : muxThumbnailUrl(asset.playbackId, saved.thumbnailTime), duration: asset.duration, downloadsEnabled: saved?.downloadsEnabled !== false, maxResolution: asset.maxResolution };
}

export async function publicWatchData(env: AdminEnvironment, slug: string) {
  const [store, metadata] = await Promise.all([readVideoProjectStore(env), readMuxMetadata(env)]);
  const project = store.projects.find((item) => item.slug === slug || item.legacySlugs?.includes(slug));
  if (project) {
    const assets = await Promise.all(project.variants.map((variant) => getMuxLibraryAsset(env, variant.assetId).catch(() => null)));
    const variants = assets.flatMap((asset, index) => asset ? [publicVariant(asset, project.variants[index].label, metadata)].filter((item): item is PublicVariant => Boolean(item)) : []);
    return { title: project.title, client: project.client, description: project.description, variants, collections: store.collections.filter((collection) => project.collectionIds.includes(collection.id)) };
  }
  if (!/^[A-Za-z0-9]+$/.test(slug)) return null;
  const asset = await getMuxLibraryAsset(env, slug).catch(() => null); if (!asset) return null;
  const saved = metadata[asset.id]; const variant = publicVariant(asset, ratioLabel(asset.aspectRatio), metadata);
  return { title: saved?.title || asset.title, client: saved?.client || '', description: '', variants: variant ? [variant] : [], collections: [] };
}

export async function publicCollectionData(env: AdminEnvironment, slug: string) {
  const [store, metadata] = await Promise.all([readVideoProjectStore(env), readMuxMetadata(env)]); const collection = store.collections.find((item) => item.slug === slug); if (!collection) return null;
  const projects = store.projects.filter((item) => item.collectionIds.includes(collection.id));
  const cards = await Promise.all(projects.map(async (project) => { const cover = await getMuxLibraryAsset(env, project.variants[0]?.assetId || '').catch(() => null); return { ...project, downloadsEnabled: project.variants.some((variant) => metadata[variant.assetId]?.downloadsEnabled !== false), thumbnailUrl: cover?.playbackPolicy === 'public' ? cover.thumbnailUrl : null }; }));
  return { collection, projects: cards };
}

export async function publicShowcaseData(env: AdminEnvironment, ids: string[]) {
  const [assets, metadata, store] = await Promise.all([getMuxLibraryAssets(env), readMuxMetadata(env), readVideoProjectStore(env)]); const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return ids.flatMap((id) => {
    const project = store.projects.find((item) => item.slug === id || item.legacySlugs?.includes(id));
    const preferredVariant = project?.variants.find((variant) => /^horiz(?:ontal)?$/i.test(variant.label)) ?? project?.variants[0];
    const asset = byId.get(preferredVariant?.assetId ?? id);
    if (!asset?.playbackId || asset.playbackPolicy !== 'public') return [];
    const saved = metadata[asset.id];
    const thumbnailUrl = muxSourceThumbnailUrl(asset.playbackId!, saved?.thumbnailTime ?? 1);
    return [{ id, assetId: asset.id, title: project?.title || saved?.title || asset.title, client: project?.client || saved?.client || '', muxPlaybackId: asset.playbackId, thumbnail: thumbnailUrl, duration: asset.duration }];
  });
}
