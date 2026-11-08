import 'server-only';

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dataDirectory } from './data-directory';

export type MuxLibraryMetadata = {
  clientsByAssetId: Record<string, string>;
  thumbnailTimesByAssetId: Record<string, number>;
  titlesByAssetId: Record<string, string>;
  tagsByAssetId: Record<string, string[]>;
  statusesByAssetId: Record<string, MuxLibraryStatus>;
  downloadsEnabledByAssetId: Record<string, boolean>;
};

export type MuxLibraryStatus = 'unreviewed' | 'published' | 'hidden';

const metadataFile = path.join(dataDirectory, 'mux-library-metadata.json');
let metadataWriteQueue: Promise<void> = Promise.resolve();

function cleanAssetId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9]+$/.test(value) ? value : '';
}

function cleanClient(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
}

function cleanTitle(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 240) : '';
}

function cleanTags(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(values.map((tag) => typeof tag === 'string' ? tag.trim().replace(/\s+/g, ' ').slice(0, 80) : '').filter(Boolean))].slice(0, 50);
}

function cleanStatus(value: unknown): MuxLibraryStatus | '' {
  return value === 'published' || value === 'hidden' || value === 'unreviewed' ? value : '';
}

function cleanThumbnailTime(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 1000) / 1000 : null;
}

export async function getMuxLibraryMetadata(): Promise<MuxLibraryMetadata> {
  try {
    const parsed = JSON.parse(await fs.readFile(metadataFile, 'utf8')) as Partial<MuxLibraryMetadata>;
    const clientsByAssetId = Object.fromEntries(Object.entries(parsed.clientsByAssetId ?? {}).flatMap(([id, client]) => {
      const cleanId = cleanAssetId(id);
      const cleanName = cleanClient(client);
      return cleanId && cleanName ? [[cleanId, cleanName]] : [];
    }));
    const thumbnailTimesByAssetId = Object.fromEntries(Object.entries(parsed.thumbnailTimesByAssetId ?? {}).flatMap(([id, time]) => {
      const cleanId = cleanAssetId(id);
      const cleanTime = cleanThumbnailTime(time);
      return cleanId && cleanTime !== null ? [[cleanId, cleanTime]] : [];
    }));
    const titlesByAssetId = Object.fromEntries(Object.entries(parsed.titlesByAssetId ?? {}).flatMap(([id, title]) => {
      const cleanId = cleanAssetId(id); const cleanValue = cleanTitle(title);
      return cleanId && cleanValue ? [[cleanId, cleanValue]] : [];
    }));
    const tagsByAssetId = Object.fromEntries(Object.entries(parsed.tagsByAssetId ?? {}).flatMap(([id, tags]) => {
      const cleanId = cleanAssetId(id);
      return cleanId ? [[cleanId, cleanTags(tags)]] : [];
    }));
    const statusesByAssetId = Object.fromEntries(Object.entries(parsed.statusesByAssetId ?? {}).flatMap(([id, status]) => {
      const cleanId = cleanAssetId(id); const cleanValue = cleanStatus(status);
      return cleanId && cleanValue ? [[cleanId, cleanValue]] : [];
    })) as Record<string, MuxLibraryStatus>;
    const downloadsEnabledByAssetId = Object.fromEntries(Object.entries(parsed.downloadsEnabledByAssetId ?? {}).flatMap(([id, enabled]) => {
      const cleanId = cleanAssetId(id);
      return cleanId && typeof enabled === 'boolean' ? [[cleanId, enabled]] : [];
    }));
    return { clientsByAssetId, thumbnailTimesByAssetId, titlesByAssetId, tagsByAssetId, statusesByAssetId, downloadsEnabledByAssetId };
  } catch {
    return { clientsByAssetId: {}, thumbnailTimesByAssetId: {}, titlesByAssetId: {}, tagsByAssetId: {}, statusesByAssetId: {}, downloadsEnabledByAssetId: {} };
  }
}

async function saveMuxLibraryMetadata(metadata: MuxLibraryMetadata) {
  await fs.mkdir(path.dirname(metadataFile), { recursive: true, mode: 0o700 });
  const temporary = `${metadataFile}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(metadata, null, 2), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, metadataFile);
  await fs.chmod(metadataFile, 0o600);
}

async function mutateMuxLibraryMetadata<T>(mutate: (metadata: MuxLibraryMetadata) => T | Promise<T>) {
  const operation = metadataWriteQueue.then(async () => {
    const metadata = await getMuxLibraryMetadata();
    const result = await mutate(metadata);
    await saveMuxLibraryMetadata(metadata);
    return result;
  });
  metadataWriteQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function assignMuxAssetsToClient(assetIds: unknown, clientValue: unknown) {
  const ids = Array.isArray(assetIds) ? [...new Set(assetIds.map(cleanAssetId).filter(Boolean))] : [];
  const client = cleanClient(clientValue);
  if (!ids.length) throw new Error('Select at least one video.');
  if (!client) throw new Error('Enter a client name.');
  await mutateMuxLibraryMetadata((metadata) => {
    ids.forEach((id) => { metadata.clientsByAssetId[id] = client; });
  });
  return { assetIds: ids, client };
}

export async function removeMuxAssetMetadata(assetIds: string[]) {
  await mutateMuxLibraryMetadata((metadata) => {
    assetIds.forEach((id) => {
      delete metadata.clientsByAssetId[id];
      delete metadata.thumbnailTimesByAssetId[id];
      delete metadata.titlesByAssetId[id];
      delete metadata.tagsByAssetId[id];
      delete metadata.statusesByAssetId[id];
      delete metadata.downloadsEnabledByAssetId[id];
    });
  });
}

export async function updateMuxAssetMetadata(assetIdValue: unknown, patch: { title?: unknown; tags?: unknown; status?: unknown; downloadsEnabled?: unknown }) {
  const assetId = cleanAssetId(assetIdValue);
  if (!assetId) throw new Error('A valid Mux asset ID is required.');
  return mutateMuxLibraryMetadata((metadata) => {
    if ('title' in patch) {
      const title = cleanTitle(patch.title);
      if (title) metadata.titlesByAssetId[assetId] = title;
      else delete metadata.titlesByAssetId[assetId];
    }
    if ('tags' in patch) metadata.tagsByAssetId[assetId] = cleanTags(patch.tags);
    if ('status' in patch) {
      const status = cleanStatus(patch.status);
      if (!status) throw new Error('Choose a valid library status.');
      metadata.statusesByAssetId[assetId] = status;
    }
    if ('downloadsEnabled' in patch) {
      if (typeof patch.downloadsEnabled !== 'boolean') throw new Error('Choose a valid download setting.');
      metadata.downloadsEnabledByAssetId[assetId] = patch.downloadsEnabled;
    }
    return {
      assetId,
      title: metadata.titlesByAssetId[assetId],
      localTags: metadata.tagsByAssetId[assetId],
      libraryStatus: metadata.statusesByAssetId[assetId],
      downloadsEnabled: metadata.downloadsEnabledByAssetId[assetId] !== false,
    };
  });
}

export async function setMuxAssetThumbnailTime(assetIdValue: unknown, timeValue: unknown) {
  const assetId = cleanAssetId(assetIdValue);
  const time = cleanThumbnailTime(timeValue);
  if (!assetId) throw new Error('A valid Mux asset ID is required.');
  if (time === null) throw new Error('Enter a valid thumbnail time.');
  await mutateMuxLibraryMetadata((metadata) => { metadata.thumbnailTimesByAssetId[assetId] = time; });
  return { assetId, time };
}
