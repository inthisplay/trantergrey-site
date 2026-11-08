import vimeoHistoryJson from './vimeo-history.json';

type VimeoHistoryRecord = {
  title: string | null;
  createdAt: string | null;
  client: string | null;
  folderPath: string | null;
};

const vimeoHistory = vimeoHistoryJson as Record<string, VimeoHistoryRecord>;

export type MuxLibraryAsset = {
  id: string;
  title: string;
  status: string;
  duration: number;
  createdAt: string | null;
  aspectRatio: string | null;
  resolution: string | null;
  maxResolution: string | null;
  playbackId: string | null;
  playbackPolicy: string | null;
  thumbnailUrl: string | null;
  playerUrl: string | null;
  externalId: string | null;
  creatorId: string | null;
  vimeoId: string | null;
  historicTitle: string | null;
  historicCreatedAt: string | null;
  historicClient: string | null;
  historicFolderPath: string | null;
  staticRenditions: Array<{
    id: string | null;
    name: string | null;
    status: string;
    resolution: string | null;
    url: string | null;
  }>;
};

export type MuxPlaybackMap = Record<string, string>;

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
  static_renditions?: {
    status?: string;
    files?: Array<{
      id?: string;
      name?: string;
      status?: string;
      resolution?: string;
      resolution_tier?: string;
    }>;
  };
};

type MuxAssetsResponse = {
  data?: MuxAsset[];
  total_row_count?: number;
};

type MuxAssetResponse = { data?: MuxAsset };
type MuxDirectUploadResponse = { data?: { id?: string; url?: string } };
type MuxDirectUploadStatusResponse = { data?: { asset_id?: string } };

const pageSize = 100;

function vimeoIdFrom(asset: MuxAsset, title: string) {
  const externalId = asset.meta?.external_id?.trim();
  if (externalId && /^\d{5,20}$/.test(externalId)) return externalId;
  return title.match(/\[(\d{5,20})\]\s*$/)?.[1] ?? null;
}

function titleWithoutVimeoId(title: string) {
  return title.replace(/\s*\[\d{5,20}\]\s*$/, '').trim();
}

export function muxThumbnailUrl(playbackId: string, time = 1, width = 720) {
  const safeTime = Number.isFinite(time) && time >= 0 ? time : 1;
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${safeTime}&width=${width}`;
}

function normalizeAsset(asset: MuxAsset): MuxLibraryAsset | null {
  if (!asset.id) return null;
  const sourceTitle = asset.meta?.title?.trim() || asset.passthrough?.trim() || `Mux asset ${asset.id.slice(0, 8)}`;
  const title = titleWithoutVimeoId(sourceTitle);
  const publicPlayback = asset.playback_ids?.find((playback) => playback.policy === 'public');
  const playback = publicPlayback ?? asset.playback_ids?.[0];
  const publicPlaybackId = publicPlayback?.id ?? null;
  const vimeoId = vimeoIdFrom(asset, sourceTitle);
  const history = vimeoId ? vimeoHistory[vimeoId] : undefined;
  const staticRenditions = (asset.static_renditions?.files ?? []).map((file) => ({
    id: file.id || null,
    name: file.name || null,
    status: file.status || asset.static_renditions?.status || 'unknown',
    resolution: file.resolution || file.resolution_tier || null,
    url: publicPlaybackId && file.name ? `https://stream.mux.com/${publicPlaybackId}/${file.name}` : null,
  }));
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
    vimeoId,
    historicTitle: history?.title || null,
    historicCreatedAt: history?.createdAt || null,
    historicClient: history?.client || null,
    historicFolderPath: history?.folderPath || null,
    staticRenditions,
  };
}

export async function getMuxLibraryAsset(assetId: string, credentials: { tokenId?: string; tokenSecret?: string }) {
  validMuxId(assetId);
  const response = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
    headers: { Authorization: muxAuthorization(credentials) },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Mux returned ${response.status} while reading the asset.`);
  const payload = await response.json() as MuxAssetResponse;
  const asset = payload.data ? normalizeAsset(payload.data) : null;
  if (!asset) throw new Error('Mux did not return the requested asset.');
  return asset;
}

export async function getMuxLibraryAssets(credentials: { tokenId?: string; tokenSecret?: string }) {
  const tokenId = credentials.tokenId?.trim();
  const tokenSecret = credentials.tokenSecret?.trim();
  if (!tokenId || !tokenSecret) throw new Error('Mux credentials are not configured.');

  const authorization = `Basic ${btoa(`${tokenId}:${tokenSecret}`)}`;
  const assets: MuxLibraryAsset[] = [];

  for (let page = 1; page <= 100; page += 1) {
    const response = await fetch(`https://api.mux.com/video/v1/assets?limit=${pageSize}&page=${page}`, {
      headers: { Authorization: authorization },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Mux returned ${response.status} while reading the library.`);
    const payload = await response.json() as MuxAssetsResponse;
    const pageAssets = (payload.data ?? []).map(normalizeAsset).filter((asset): asset is MuxLibraryAsset => Boolean(asset));
    assets.push(...pageAssets);
    if (pageAssets.length < pageSize || (payload.total_row_count !== undefined && assets.length >= payload.total_row_count)) break;
  }

  return assets.sort((first, second) => (second.historicCreatedAt || second.createdAt || '').localeCompare(first.historicCreatedAt || first.createdAt || ''));
}

function muxAuthorization(credentials: { tokenId?: string; tokenSecret?: string }) {
  const tokenId = credentials.tokenId?.trim();
  const tokenSecret = credentials.tokenSecret?.trim();
  if (!tokenId || !tokenSecret) throw new Error('Mux credentials are not configured.');
  return `Basic ${btoa(`${tokenId}:${tokenSecret}`)}`;
}

export async function deleteMuxAssets(assetIds: string[], credentials: { tokenId?: string; tokenSecret?: string }) {
  const authorization = muxAuthorization(credentials);
  for (const assetId of assetIds) {
    if (!/^[A-Za-z0-9]+$/.test(assetId)) throw new Error('An invalid Mux asset ID was provided.');
    const response = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
      method: 'DELETE',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok && response.status !== 404) throw new Error(`Mux returned ${response.status} while deleting an asset.`);
  }
}

function validMuxId(value: string) {
  if (!/^[A-Za-z0-9]+$/.test(value)) throw new Error('An invalid Mux ID was provided.');
}

async function muxMutation(
  path: string,
  credentials: { tokenId?: string; tokenSecret?: string },
  init: { method: 'POST' | 'DELETE'; body?: object },
) {
  const response = await fetch(`https://api.mux.com/video/v1/${path}`, {
    method: init.method,
    headers: {
      Authorization: muxAuthorization(credentials),
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  if (!response.ok && !(init.method === 'DELETE' && response.status === 404)) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message || `Mux returned ${response.status}.`);
  }
  return response.status === 204 || response.status === 404 ? null : response.json();
}

export async function createMuxStaticRendition(assetId: string, credentials: { tokenId?: string; tokenSecret?: string }, resolution: 'highest' | '1080p' | '720p' | '540p' = 'highest') {
  validMuxId(assetId);
  return muxMutation(`assets/${assetId}/static-renditions`, credentials, { method: 'POST', body: { resolution } });
}

export async function createMuxPublicPlaybackId(assetId: string, credentials: { tokenId?: string; tokenSecret?: string }) {
  validMuxId(assetId);
  return muxMutation(`assets/${assetId}/playback-ids`, credentials, { method: 'POST', body: { policy: 'public' } });
}

export async function createMuxDirectUpload(title: string, corsOrigin: string, credentials: { tokenId?: string; tokenSecret?: string }) {
  const safeTitle = title.trim().slice(0, 255);
  if (!safeTitle) throw new Error('A video title is required.');
  const response = await fetch('https://api.mux.com/video/v1/uploads', {
    method: 'POST',
    headers: { Authorization: muxAuthorization(credentials), 'Content-Type': 'application/json' },
    body: JSON.stringify({ cors_origin: corsOrigin, new_asset_settings: { playback_policies: ['public'], video_quality: 'plus', meta: { title: safeTitle } } }),
    cache: 'no-store',
  });
  const responseText = await response.text();
  const payload = responseText ? JSON.parse(responseText) as MuxDirectUploadResponse | { error?: { message?: string }; message?: string } : null;
  const muxError = payload && 'error' in payload ? payload.error?.message : undefined;
  if (!response.ok) throw new Error(muxError || (payload && 'message' in payload ? payload.message : undefined) || responseText.slice(0, 240) || `Mux returned ${response.status}.`);
  const upload = (payload as MuxDirectUploadResponse | null)?.data;
  if (!upload?.id || !upload.url) throw new Error('Mux did not return an upload URL.');
  return { id: upload.id, url: upload.url };
}

export async function getMuxDirectUploadAssetId(uploadId: string, credentials: { tokenId?: string; tokenSecret?: string }) {
  validMuxId(uploadId);
  const response = await fetch(`https://api.mux.com/video/v1/uploads/${uploadId}`, { headers: { Authorization: muxAuthorization(credentials) }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Mux returned ${response.status} while checking the upload.`);
  const payload = await response.json() as MuxDirectUploadStatusResponse;
  return payload.data?.asset_id || null;
}

export async function deleteMuxPlaybackId(assetId: string, playbackId: string, credentials: { tokenId?: string; tokenSecret?: string }) {
  validMuxId(assetId);
  validMuxId(playbackId);
  return muxMutation(`assets/${assetId}/playback-ids/${playbackId}`, credentials, { method: 'DELETE' });
}

export function getAutoApprovedMuxPlaybackMap(assets: MuxLibraryAsset[]): MuxPlaybackMap {
  const playbackByVimeoId: MuxPlaybackMap = {};
  for (const asset of assets) {
    if (asset.status !== 'ready' || asset.playbackPolicy !== 'public' || !asset.vimeoId || !asset.playbackId) continue;
    if (!playbackByVimeoId[asset.vimeoId]) playbackByVimeoId[asset.vimeoId] = asset.playbackId;
  }
  return playbackByVimeoId;
}
