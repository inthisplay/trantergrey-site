import { matchMuxAssetsToVimeo, type MatchedMuxLibraryAsset, type VimeoMatchCandidate } from '../../lib/mux-matching';
import { createMuxSearch } from '../../lib/mux-search';
import type { AdminEnvironment } from './admin';
import { getMuxLibraryAssets, muxThumbnailUrl } from './mux';
import { readMuxMetadata, readVideoProjectStore } from './mux-state';
import type { VideoProject, VideoProjectCollection } from '../../lib/video-projects-shared';
import publishedLibrarySeed from '../../lib/published-vimeo-library.json';

const browseIndexLifetimeMs = Number.POSITIVE_INFINITY;
type BrowseStateRow = { refresh_id: string | null; refreshed_at: string | null; asset_count: number };
type BrowseAssetRow = { asset_id: string; value: string };
type BrowseFacetRow = { client: string; count: number };
type BrowseStatusRow = { library_status: 'published' | 'unreviewed' | 'hidden'; count: number };

export type MuxBrowseFilters = { query?: string; client?: string; status?: string; thumbnail?: string; dateStart?: string; dateEnd?: string; cursor?: number; limit?: number };

function browseSearchText(asset: MatchedMuxLibraryAsset, groupTerms: string[] = []) {
  return [asset.title, asset.historicTitle, asset.historicFolderPath, asset.client, asset.vimeoMatch?.title, asset.vimeoSuggestion?.title, ...asset.localTags]
    .concat(groupTerms).filter((value): value is string => Boolean(value)).join(' ').toLowerCase();
}

function ftsQuery(value: string) {
  const words = value.normalize('NFKD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.map((word) => `${word}*`).join(' AND ');
}

function parseBrowseAsset(value: string) {
  try { const asset = JSON.parse(value) as MatchedMuxLibraryAsset; return asset?.id ? asset : null; }
  catch { return null; }
}

async function browseIndexFresh(env: AdminEnvironment) {
  const state = await env.TG_DATA.prepare('SELECT refresh_id, refreshed_at, asset_count FROM mux_library_browse_state WHERE id = ?').bind('library').first<BrowseStateRow>();
  return state?.refresh_id && state.refreshed_at && Date.now() - Date.parse(state.refreshed_at) < browseIndexLifetimeMs ? state : null;
}

async function writeBrowseIndex(env: AdminEnvironment, assets: MatchedMuxLibraryAsset[], projects: VideoProject[], collections: VideoProjectCollection[]) {
  const refreshId = crypto.randomUUID(); const refreshedAt = new Date().toISOString();
  const collectionTerms = new Map(collections.map((collection) => [collection.id, [
    collection.name,
    collection.slug.replace(/-/g, ' '),
    ...collection.tags,
  ]]));
  const groupTermsByAssetId = new Map<string, Set<string>>();
  for (const project of projects) {
    const terms = [
      project.title,
      project.slug.replace(/-/g, ' '),
      project.client || '',
      ...project.collectionIds.flatMap((id) => collectionTerms.get(id) || []),
    ];
    project.variants.forEach((variant) => {
      const existing = groupTermsByAssetId.get(variant.assetId) || new Set<string>();
      terms.forEach((term) => { if (term) existing.add(term); });
      groupTermsByAssetId.set(variant.assetId, existing);
    });
  }
  for (let start = 0; start < assets.length; start += 75) {
    const batch = assets.slice(start, start + 75);
    await env.TG_DATA.batch([
      ...batch.map((asset) => env.TG_DATA.prepare('INSERT INTO mux_library_browse_assets (asset_id, refresh_id, title, client, library_status, created_at, has_custom_thumbnail, search_text, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(asset.id, refreshId, asset.title, asset.client?.trim() || 'Unassigned', asset.libraryStatus, asset.historicCreatedAt || asset.createdAt, asset.hasCustomThumbnail ? 1 : 0, browseSearchText(asset, [...(groupTermsByAssetId.get(asset.id) || [])]), JSON.stringify(asset))),
      ...batch.map((asset) => env.TG_DATA.prepare('INSERT INTO mux_library_browse_search (asset_id, refresh_id, search_text) VALUES (?, ?, ?)').bind(asset.id, refreshId, browseSearchText(asset, [...(groupTermsByAssetId.get(asset.id) || [])]))),
    ]);
  }
  await env.TG_DATA.prepare(`INSERT INTO mux_library_browse_state (id, refresh_id, refreshed_at, asset_count) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET refresh_id=excluded.refresh_id, refreshed_at=excluded.refreshed_at, asset_count=excluded.asset_count`)
    .bind('library', refreshId, refreshedAt, assets.length).run();
}

async function ensureBrowseIndex(env: AdminEnvironment) {
  const state = await browseIndexFresh(env);
  if (state) return state;
  const library = await readEnrichedMuxLibrary(env);
  await writeBrowseIndex(env, library.assets, library.projects, library.collections);
  return env.TG_DATA.prepare('SELECT refresh_id, refreshed_at, asset_count FROM mux_library_browse_state WHERE id = ?').bind('library').first<BrowseStateRow>();
}

export async function invalidateMuxBrowseIndex(env: AdminEnvironment) {
  await env.TG_DATA.prepare("UPDATE mux_library_browse_state SET refreshed_at = NULL WHERE id = ?")
    .bind('library').run();
}

export async function readMuxLibraryBrowsePage(env: AdminEnvironment, filters: MuxBrowseFilters) {
  const state = await ensureBrowseIndex(env);
  if (!state?.refresh_id) throw new Error('The Mux browse index could not be prepared.');
  const where = ['b.refresh_id = ?']; const values: unknown[] = [state.refresh_id];
  const fts = ftsQuery(filters.query || '');
  if (fts) { where.push('s.refresh_id = ? AND s.search_text MATCH ?'); values.push(state.refresh_id, fts); }
  if (filters.client && filters.client !== 'All') { where.push('b.client = ?'); values.push(filters.client); }
  if (filters.status && filters.status !== 'all') { where.push('b.library_status = ?'); values.push(filters.status); }
  if (filters.thumbnail === 'needs-thumbnail') where.push('b.has_custom_thumbnail = 0');
  if (filters.thumbnail === 'custom-thumbnail') where.push('b.has_custom_thumbnail = 1');
  if (filters.dateStart) { where.push("substr(COALESCE(b.created_at, ''), 1, 10) >= ?"); values.push(filters.dateStart); }
  if (filters.dateEnd) { where.push("substr(COALESCE(b.created_at, ''), 1, 10) <= ?"); values.push(filters.dateEnd); }
  const join = fts ? 'JOIN mux_library_browse_search s ON s.asset_id = b.asset_id' : '';
  const condition = where.join(' AND ');
  const total = await env.TG_DATA.prepare(`SELECT COUNT(*) AS count FROM mux_library_browse_assets b ${join} WHERE ${condition}`).bind(...values).first<{ count: number }>();
  const limit = Math.max(1, Math.min(filters.limit || 48, 96)); const cursor = Math.max(0, filters.cursor || 0);
  const rows = await env.TG_DATA.prepare(`SELECT b.asset_id, b.value FROM mux_library_browse_assets b ${join} WHERE ${condition} ORDER BY b.created_at DESC, b.asset_id DESC LIMIT ? OFFSET ?`).bind(...values, limit, cursor).all<BrowseAssetRow>();
  let assets = rows.results.flatMap((row) => { const asset = parseBrowseAsset(row.value); return asset ? [asset] : []; });
  let totalCount = total?.count || 0;
  // FTS covers normal title/client/tag searches cheaply. Preserve the previous
  // typo-tolerant behavior with a local-snapshot fallback when it finds none.
  if (fts && !assets.length) {
    const library = await readEnrichedMuxLibrary(env);
    const matches = createMuxSearch(library.assets)(filters.query || '').filter((asset) =>
      (!filters.client || filters.client === 'All' || (asset.client?.trim() || 'Unassigned') === filters.client)
      && (!filters.status || filters.status === 'all' || asset.libraryStatus === filters.status)
      && (filters.thumbnail !== 'needs-thumbnail' || !asset.hasCustomThumbnail)
      && (filters.thumbnail !== 'custom-thumbnail' || Boolean(asset.hasCustomThumbnail))
      && (!filters.dateStart || (asset.historicCreatedAt || asset.createdAt || '').slice(0, 10) >= filters.dateStart)
      && (!filters.dateEnd || (asset.historicCreatedAt || asset.createdAt || '').slice(0, 10) <= filters.dateEnd)
    );
    totalCount = matches.length;
    assets = matches.slice(cursor, cursor + limit);
  }
  const [clients, directory, statuses, thumbnails, years] = await Promise.all([
    env.TG_DATA.prepare('SELECT client, COUNT(*) AS count FROM mux_library_browse_assets WHERE refresh_id = ? GROUP BY client ORDER BY client COLLATE NOCASE').bind(state.refresh_id).all<BrowseFacetRow>(),
    env.TG_DATA.prepare('SELECT name FROM client_directory ORDER BY name COLLATE NOCASE').all<{ name: string }>(),
    env.TG_DATA.prepare('SELECT library_status, COUNT(*) AS count FROM mux_library_browse_assets WHERE refresh_id = ? GROUP BY library_status').bind(state.refresh_id).all<BrowseStatusRow>(),
    env.TG_DATA.prepare('SELECT SUM(CASE WHEN has_custom_thumbnail = 0 THEN 1 ELSE 0 END) AS needsThumbnail, SUM(CASE WHEN has_custom_thumbnail = 1 THEN 1 ELSE 0 END) AS customThumbnail FROM mux_library_browse_assets WHERE refresh_id = ?').bind(state.refresh_id).first<{ needsThumbnail: number; customThumbnail: number }>(),
    env.TG_DATA.prepare("SELECT DISTINCT CAST(substr(created_at, 1, 4) AS INTEGER) AS year FROM mux_library_browse_assets WHERE refresh_id = ? AND created_at IS NOT NULL ORDER BY year DESC").bind(state.refresh_id).all<{ year: number }>(),
  ]);
  const statusCounts = { all: state.asset_count, published: 0, unreviewed: 0, hidden: 0 };
  statuses.results.forEach((row) => { statusCounts[row.library_status] = row.count; });
  const clientNames = [...new Set(clients.results.map((row) => row.client))].sort((first, second) => first.localeCompare(second));
  return { assets, pageAssetIds: assets.map((asset) => asset.id), total: totalCount, nextCursor: cursor + assets.length < totalCount ? cursor + assets.length : null, facets: { clients: ['All', ...clientNames], directoryClients: directory.results.map(row=>row.name), years: years.results.map((row) => row.year), statusCounts, thumbnailCounts: { needsThumbnail: thumbnails?.needsThumbnail || 0, customThumbnail: thumbnails?.customThumbnail || 0 } } };
}

export async function readMuxBrowseAssetsById(env: AdminEnvironment, ids: Iterable<string>) {
  const state = await ensureBrowseIndex(env); const unique = [...new Set(ids)];
  if (!state?.refresh_id || !unique.length) return [];
  const rows = await env.TG_DATA.prepare(`SELECT value FROM mux_library_browse_assets WHERE refresh_id = ? AND asset_id IN (${unique.map(() => '?').join(', ')})`).bind(state.refresh_id, ...unique).all<{ value: string }>();
  return rows.results.flatMap((row) => { const asset = parseBrowseAsset(row.value); return asset ? [asset] : []; });
}

type VimeoRecord = VimeoMatchCandidate & {
  createdAt?: string | null;
  folderPath?: string | null;
  localTags?: string[];
  libraryStatus?: 'unreviewed' | 'published' | 'hidden';
};

export async function readEnrichedMuxLibrary(env: AdminEnvironment, options: { forceMuxRefresh?: boolean } = {}) {
  const [muxAssets, metadata, store] = await Promise.all([
    getMuxLibraryAssets(env, { forceRefresh: options.forceMuxRefresh }),
    readMuxMetadata(env),
    readVideoProjectStore(env),
  ]);
  // Keep the bundled historic archive only to preserve legacy dates and client
  // names while Mux metadata is being completed. No runtime Vimeo state or API
  // is consulted by the Mux catalog.
  const publishedVideos = publishedLibrarySeed.videos as VimeoRecord[];
  const videos = publishedVideos.flatMap((raw) => {
    const video = raw as VimeoRecord;
    return typeof video.id === 'string' && typeof video.title === 'string' && Number.isFinite(video.duration) ? [video] : [];
  });
  const byId = new Map(videos.map((video) => [video.id, video]));
  const projectClients = new Map(store.projects.flatMap((project) => project.variants.map((variant) => [variant.assetId, project.client] as const)));
  const assets = matchMuxAssetsToVimeo(muxAssets, videos).map((matched) => {
    const sourceId = matched.vimeoMatch?.id || matched.vimeoId;
    const source = sourceId ? byId.get(sourceId) : undefined;
    const saved = metadata[matched.id];
    return {
      ...matched,
      title: saved?.title || source?.customTitle?.trim() || source?.title?.trim() || matched.title,
      client: saved?.client || projectClients.get(matched.id) || matched.client || source?.client?.trim() || null,
      localTags: saved?.tags ?? (Array.isArray(source?.localTags) ? source.localTags : []),
      libraryStatus: saved?.status || source?.libraryStatus || 'unreviewed',
      thumbnailTime: saved?.thumbnailTime ?? 1,
      hasCustomThumbnail: saved?.thumbnailTime !== null && saved?.thumbnailTime !== undefined,
      thumbnailUrl: matched.playbackId && saved?.thumbnailTime !== null && saved?.thumbnailTime !== undefined ? muxThumbnailUrl(matched.playbackId, saved.thumbnailTime) : matched.thumbnailUrl,
      downloadsEnabled: saved?.downloadsEnabled !== false,
      historicTitle: source?.title || matched.historicTitle,
      historicCreatedAt: source?.createdAt || matched.historicCreatedAt,
      historicClient: source?.client || matched.historicClient,
      historicFolderPath: source?.folderPath || matched.historicFolderPath,
    } satisfies MatchedMuxLibraryAsset & { thumbnailTime: number; hasCustomThumbnail: boolean; downloadsEnabled: boolean };
  });
  return { assets, ...store };
}

/**
 * Rebuild both catalog layers ahead of an admin request. The snapshot is
 * swapped atomically and the existing browse index remains live until its
 * replacement is complete.
 */
export async function refreshMuxLibraryCatalog(env: AdminEnvironment) {
  const library = await readEnrichedMuxLibrary(env, { forceMuxRefresh: true });
  await writeBrowseIndex(env, library.assets, library.projects, library.collections);
  return { assetCount: library.assets.length };
}
