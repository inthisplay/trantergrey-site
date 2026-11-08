import type { AdminEnvironment } from './admin';
import type { MuxLibraryAsset } from '../../lib/mux-shared';
export type { MuxLibraryAsset } from '../../lib/mux-shared';

type MuxAsset = {
  id?: string;
  status?: string;
  duration?: number;
  created_at?: number;
  aspect_ratio?: string;
  resolution_tier?: string;
  max_stored_resolution?: string;
  max_resolution_tier?: string;
  passthrough?: string;
  playback_ids?: Array<{ id?: string; policy?: string }>;
  meta?: { title?: string; external_id?: string; creator_id?: string };
  static_renditions?: { status?: string; files?: Array<{ id?: string; name?: string; status?: string; resolution?: string; resolution_tier?: string }> };
};

type MuxResponse<T> = { data?: T; total_row_count?: number; error?: { message?: string }; message?: string };

function authorization(env: AdminEnvironment) {
  const id = env.MUX_TOKEN_ID?.trim();
  const secret = env.MUX_TOKEN_SECRET?.trim();
  if (!id || !secret) throw new Error('Mux credentials are not configured.');
  return `Basic ${btoa(`${id}:${secret}`)}`;
}

function validId(value: string) {
  if (!/^[A-Za-z0-9]+$/.test(value)) throw new Error('An invalid Mux ID was provided.');
}

function vimeoId(asset: MuxAsset, title: string) {
  const externalId = asset.meta?.external_id?.trim();
  if (externalId && /^\d{5,20}$/.test(externalId)) return externalId;
  return title.match(/\[(\d{5,20})\]\s*$/)?.[1] ?? null;
}

export function muxThumbnailUrl(playbackId: string, time = 1, width = 720) {
  const safeTime = Number.isFinite(time) && time >= 0 ? time : 1;
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${safeTime}&width=${width}`;
}

function normalize(asset: MuxAsset): MuxLibraryAsset | null {
  if (!asset.id) return null;
  const sourceTitle = asset.meta?.title?.trim() || asset.passthrough?.trim() || `Mux asset ${asset.id.slice(0, 8)}`;
  const title = sourceTitle.replace(/\s*\[\d{5,20}\]\s*$/, '').trim();
  const publicPlayback = asset.playback_ids?.find((item) => item.policy === 'public');
  const playback = publicPlayback ?? asset.playback_ids?.[0];
  const publicPlaybackId = publicPlayback?.id ?? null;
  return {
    id: asset.id,
    title,
    status: asset.status || 'unknown',
    duration: Math.max(0, Math.round(asset.duration || 0)),
    createdAt: asset.created_at ? new Date(asset.created_at * 1000).toISOString() : null,
    aspectRatio: asset.aspect_ratio || null,
    resolution: asset.max_stored_resolution || asset.resolution_tier || null,
    maxResolution: asset.max_resolution_tier || asset.max_stored_resolution || asset.resolution_tier || null,
    playbackId: playback?.id || null,
    playbackPolicy: playback?.policy || null,
    thumbnailUrl: publicPlaybackId ? muxThumbnailUrl(publicPlaybackId) : null,
    playerUrl: publicPlaybackId ? `https://player.mux.com/${publicPlaybackId}` : null,
    externalId: asset.meta?.external_id?.trim() || null,
    creatorId: asset.meta?.creator_id?.trim() || null,
    vimeoId: vimeoId(asset, sourceTitle),
    historicTitle: null,
    historicCreatedAt: null,
    historicClient: null,
    historicFolderPath: null,
    staticRenditions: (asset.static_renditions?.files ?? []).map((file) => ({
      id: file.id || null,
      name: file.name || null,
      status: file.status || asset.static_renditions?.status || 'unknown',
      resolution: file.resolution || file.resolution_tier || null,
      url: publicPlaybackId && file.name ? `https://stream.mux.com/${publicPlaybackId}/${file.name}` : null,
    })),
  };
}

async function muxFetch<T>(env: AdminEnvironment, path: string, init?: RequestInit) {
  const response = await fetch(`https://api.mux.com/video/v1/${path}`, {
    ...init,
    headers: { Authorization: authorization(env), 'Content-Type': 'application/json', ...init?.headers },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as MuxResponse<T> : null;
  if (!response.ok && !(init?.method === 'DELETE' && response.status === 404)) {
    throw new Error(payload?.error?.message || payload?.message || `Mux returned ${response.status}.`);
  }
  return payload?.data;
}

export async function getMuxLibraryAssets(env: AdminEnvironment) {
  const assets: MuxLibraryAsset[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await fetch(`https://api.mux.com/video/v1/assets?limit=100&page=${page}`, { headers: { Authorization: authorization(env) } });
    if (!response.ok) throw new Error(`Mux returned ${response.status} while reading the library.`);
    const payload = await response.json() as MuxResponse<MuxAsset[]>;
    const pageAssets = (payload.data ?? []).map(normalize).filter((asset): asset is MuxLibraryAsset => Boolean(asset));
    assets.push(...pageAssets);
    if (pageAssets.length < 100 || (payload.total_row_count !== undefined && assets.length >= payload.total_row_count)) break;
  }
  return assets.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function getMuxLibraryAsset(env: AdminEnvironment, assetId: string) {
  validId(assetId);
  const raw = await muxFetch<MuxAsset>(env, `assets/${assetId}`);
  const asset = raw ? normalize(raw) : null;
  if (!asset) throw new Error('Mux did not return the requested asset.');
  return asset;
}

export async function deleteMuxAssets(env: AdminEnvironment, ids: string[]) {
  for (const id of ids) { validId(id); await muxFetch(env, `assets/${id}`, { method: 'DELETE' }); }
}

export async function createMuxPublicPlaybackId(env: AdminEnvironment, assetId: string) {
  validId(assetId);
  return muxFetch(env, `assets/${assetId}/playback-ids`, { method: 'POST', body: JSON.stringify({ policy: 'public' }) });
}

export async function deleteMuxPlaybackId(env: AdminEnvironment, assetId: string, playbackId: string) {
  validId(assetId); validId(playbackId);
  return muxFetch(env, `assets/${assetId}/playback-ids/${playbackId}`, { method: 'DELETE' });
}

export async function createMuxStaticRendition(env: AdminEnvironment, assetId: string, resolution: 'highest' | '1080p' | '720p' | '540p' = 'highest') {
  validId(assetId);
  return muxFetch(env, `assets/${assetId}/static-renditions`, { method: 'POST', body: JSON.stringify({ resolution }) });
}

export async function createMuxDirectUpload(env: AdminEnvironment, title: string, corsOrigin: string) {
  const safeTitle = title.trim().slice(0, 255);
  if (!safeTitle) throw new Error('A video title is required.');
  const upload = await muxFetch<{ id?: string; url?: string }>(env, 'uploads', {
    method: 'POST',
    body: JSON.stringify({ cors_origin: corsOrigin, new_asset_settings: { playback_policies: ['public'], video_quality: 'plus', meta: { title: safeTitle } } }),
  });
  if (!upload?.id || !upload.url) throw new Error('Mux did not return an upload URL.');
  return { id: upload.id, url: upload.url };
}

export async function getMuxDirectUploadAssetId(env: AdminEnvironment, uploadId: string) {
  validId(uploadId);
  const upload = await muxFetch<{ asset_id?: string }>(env, `uploads/${uploadId}`);
  return upload?.asset_id || null;
}
