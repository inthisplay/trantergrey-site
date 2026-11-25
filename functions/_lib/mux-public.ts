import { clientPublicLogo, publicProjectClient } from './client-public-logo';
import type { AdminEnvironment } from './admin';
import { getMuxLibraryAsset, getMuxLibraryAssets, muxSourceThumbnailUrl, muxThumbnailUrl } from './mux';
import { readMuxMetadata, readVideoProjectStore } from './mux-state';
import { ratioLabel } from '../../lib/video-projects-shared';

export type PublicVariant = { status: string; processing?: import('../../lib/mux-upload-status').ProcessingProgress | null; assetId: string; label: string; aspectRatio: string | null; playbackId: string; thumbnailUrl: string | null; duration: number; downloadsEnabled: boolean; maxResolution: string | null };

function publicVariant(asset: Awaited<ReturnType<typeof getMuxLibraryAsset>>, label: string, metadata: Awaited<ReturnType<typeof readMuxMetadata>>): PublicVariant | null {
  if (!asset.playbackId || asset.playbackPolicy !== 'public') return null;
  const saved = metadata[asset.id];
  return { status: asset.status, processing: asset.processing, assetId: asset.id, label, aspectRatio: asset.aspectRatio, playbackId: asset.playbackId, thumbnailUrl: saved?.thumbnailTime === null || saved?.thumbnailTime === undefined ? asset.thumbnailUrl : muxThumbnailUrl(asset.playbackId, saved.thumbnailTime), duration: asset.duration, downloadsEnabled: saved?.downloadsEnabled !== false, maxResolution: asset.maxResolution };
}

export async function publicWatchData(env: AdminEnvironment, slug: string) {
  const [store, metadata] = await Promise.all([readVideoProjectStore(env), readMuxMetadata(env)]);
  const project = store.projects.find((item) => item.slug === slug || item.legacySlugs?.includes(slug));
  if (project) {
    const assets = await Promise.all(project.variants.map((variant) => getMuxLibraryAsset(env, variant.assetId).catch(() => null)));
    const variants = assets.flatMap((asset, index) => asset ? [publicVariant(asset, project.variants[index].label, metadata)].filter((item): item is PublicVariant => Boolean(item)) : []);
    // A share URL must not reveal metadata for a project with no public asset.
    if (project.variants.length && !assets.some(asset => asset?.playbackPolicy === 'public')) return null;
    const client = await publicProjectClient(env, project).catch(() => project.client);
    const unbrandedPublicPage = variants.length > 0 || project.unbrandedPublicPage === true;
    const logoKey = await clientPublicLogo(env, {...project, client, unbrandedPublicPage}).catch(() => null);
    return { pending: assets.some(asset => asset?.status === 'preparing'), clientLogoUrl: logoKey ? `/api/watch/${encodeURIComponent(project.slug)}/logo` : null, title: project.title, client, description: project.description, unbrandedPublicPage, variants, collections: store.collections.filter((collection) => project.collectionIds.includes(collection.id)) };
  }
  if (!/^[A-Za-z0-9]+$/.test(slug)) return null;
  const asset = await getMuxLibraryAsset(env, slug).catch(() => null); if (!asset) return null;
  const saved = metadata[asset.id]; const variant = publicVariant(asset, ratioLabel(asset.aspectRatio), metadata);
  if (asset.playbackPolicy !== 'public') return null;
  const client = await publicProjectClient(env, { client: saved?.client || null, variants: [{assetId:asset.id}] }).catch(() => saved?.client || null);
  const logoKey = variant ? await clientPublicLogo(env, { client, unbrandedPublicPage: true }).catch(() => null) : null;
  return { pending: asset.status === 'preparing', clientLogoUrl: logoKey ? `/api/watch/${encodeURIComponent(asset.id)}/logo` : null, title: saved?.title || asset.title, client: client || '', description: '', unbrandedPublicPage: Boolean(variant), variants: variant ? [variant] : [], collections: [] };
}

export async function publicCollectionData(env: AdminEnvironment, slug: string) {
  const store = await readVideoProjectStore(env);
  const collection = store.collections.find((item) => item.slug === slug);
  if (!collection) return null;

  const projects = store.projects.filter((item) => item.collectionIds.includes(collection.id));
  const assetIds = [...new Set(projects.flatMap((project) => project.variants.map(({ assetId }) => assetId)))];
  const [metadata, assets] = await Promise.all([
    readMuxMetadata(env),
    Promise.all(assetIds.map((id) => getMuxLibraryAsset(env, id).catch(() => null))),
  ]);
  const publicAssets = new Map(assets.flatMap((asset) =>
    asset?.playbackId && asset.playbackPolicy === 'public' ? [[asset.id, asset] as const] : [],
  ));
  const cards = projects.flatMap((project) => {
    const variants = project.variants.filter(({ assetId }) => publicAssets.has(assetId));
    return variants.length ? [{ ...project, variants, thumbnailUrl: publicAssets.get(variants[0].assetId)?.thumbnailUrl ?? null }] : [];
  });
  const downloadAssetIds = assetIds.filter((id) => publicAssets.has(id) && metadata[id]?.downloadsEnabled !== false);
  return { collection, projects: cards, downloadAssetIds };
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
