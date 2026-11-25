import type { AdminEnvironment } from './admin';
import { getMuxLibraryAsset } from './mux';
import { readVideoProjectStore } from './mux-state';
import { ratioLabel } from '../../lib/video-projects-shared';

export class ReplacementError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Atomic local swap; original Mux media is retained for explicit deletion later. */
export async function replaceVideo(env: AdminEnvironment, assetId: string, replacementId: string, actorEmail: string) {
  if (!/^[A-Za-z0-9]{1,255}$/.test(assetId) || !/^[A-Za-z0-9]{1,255}$/.test(replacementId) || assetId === replacementId) throw new ReplacementError('Choose two different valid videos.');
  const replay = async () => {
    const row = await env.TG_DATA.prepare('SELECT replacement_asset_id,result_json FROM mux_asset_replacements WHERE asset_id=?').bind(assetId).first<{ replacement_asset_id: string; result_json: string }>();
    if (!row) return null;
    if (row.replacement_asset_id !== replacementId) throw new ReplacementError('This video was already replaced. Refresh the library before replacing it again.', 409);
    return { ...JSON.parse(row.result_json), replayed: true };
  };
  const prior = await replay(); if (prior) return prior;
  const [previous, replacement, store] = await Promise.all([getMuxLibraryAsset(env, assetId), getMuxLibraryAsset(env, replacementId), readVideoProjectStore(env)]);
  if (replacement.status !== 'ready' || !replacement.playbackId || replacement.playbackPolicy !== 'public') throw new ReplacementError('The replacement video is still processing or is not publicly playable. Try again once it is ready.');
  if (store.projects.some(p => p.variants.some(v => v.assetId === replacementId))) throw new ReplacementError('The replacement already belongs to a video page. Choose a new upload.', 409);
  const now = new Date().toISOString();
  const affected = store.projects.filter(p => p.variants.some(v => v.assetId === assetId));
  const projects = affected.length ? affected.map(p => ({ ...p, updatedAt: now, variants: p.variants.map(v => v.assetId === assetId ? { ...v, assetId: replacementId, aspectRatio: replacement.aspectRatio } : v) })) : [{
    id: crypto.randomUUID(), slug: assetId, title: previous.title, client: null, description: null,
    variants: [{ assetId: replacementId, label: ratioLabel(replacement.aspectRatio), aspectRatio: replacement.aspectRatio, order: 0 }],
    collectionIds: [], createdAt: now, updatedAt: now,
  }];
  const result = { project: projects[0], originalRetained: true, originalAssetId: assetId };
  const sql = env.TG_DATA;
  const references = "EXISTS (SELECT 1 FROM json_each(mux_video_projects.value,'$.variants') WHERE json_extract(json_each.value,'$.assetId')=?)";
  const statements = [
    sql.prepare('INSERT INTO mux_asset_replacements(asset_id,replacement_asset_id,result_json,actor_email,created_at) VALUES(?,?,?,?,?)').bind(assetId, replacementId, JSON.stringify(result), actorEmail, now),
    sql.prepare(`SELECT CASE WHEN (SELECT COUNT(*) FROM mux_video_projects WHERE ${references}) != ? OR EXISTS(SELECT 1 FROM mux_video_projects WHERE ${references}) THEN json('stale replacement') END`).bind(assetId, affected.length, replacementId),
    ...affected.map(p => sql.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM mux_video_projects WHERE id=? AND json(value)=json(?)) THEN json('stale replacement') END").bind(p.id, JSON.stringify(p))),
    sql.prepare(`INSERT INTO mux_asset_metadata(asset_id,title,client,tags,status,thumbnail_time,downloads_enabled,updated_at)
      SELECT ?,COALESCE(title,?),client,tags,COALESCE(status,'unreviewed'),thumbnail_time,COALESCE(downloads_enabled,1),? FROM (SELECT 1) LEFT JOIN mux_asset_metadata ON asset_id=? WHERE true
      ON CONFLICT(asset_id) DO UPDATE SET title=excluded.title,client=excluded.client,tags=excluded.tags,status=excluded.status,thumbnail_time=excluded.thumbnail_time,downloads_enabled=excluded.downloads_enabled,updated_at=excluded.updated_at`).bind(replacementId, previous.title, now, assetId),
    ...projects.map(p => sql.prepare(`INSERT INTO mux_video_projects(id,slug,value,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(p.id,p.slug,JSON.stringify(p),p.createdAt,now)),
    sql.prepare(`INSERT INTO production_card_activity(id,card_id,event_type,occurred_at,actor_type,actor_id,asset_id,details_json)
      SELECT 'replacement:' || id || ':' || ?,card_id,'video_replaced',?,'user',?,?,? FROM production_card_video_links WHERE asset_id=?`).bind(replacementId,now,actorEmail,replacementId,JSON.stringify({previousAssetId:assetId,replacementAssetId:replacementId,originalRetained:true}),assetId),
    // Preserve historical activity when two links merge. Clearing link_id avoids
    // the UNIQUE(link_id,event_type) constraint; original asset_id stays historical.
    sql.prepare(`UPDATE production_card_activity SET link_id=NULL WHERE link_id IN (SELECT old.id FROM production_card_video_links old JOIN production_card_video_links target ON target.card_id=old.card_id AND target.asset_id=? WHERE old.asset_id=?)`).bind(replacementId,assetId),
    sql.prepare(`DELETE FROM production_card_video_links WHERE asset_id=? AND EXISTS(SELECT 1 FROM production_card_video_links target WHERE target.card_id=production_card_video_links.card_id AND target.asset_id=?)`).bind(assetId,replacementId),
    sql.prepare(`UPDATE production_card_video_links SET asset_id=?,source_uploaded_at=COALESCE((SELECT requested_at FROM mux_asset_ingests WHERE asset_id=?),?),uploader_name=(SELECT uploader_name FROM mux_asset_ingests WHERE asset_id=?),uploader_email=(SELECT uploader_email FROM mux_asset_ingests WHERE asset_id=?) WHERE asset_id=?`).bind(replacementId,replacementId,replacement.createdAt,replacementId,replacementId,assetId),
    sql.prepare("UPDATE mux_library_browse_state SET refreshed_at=NULL WHERE id='library'"),
    sql.prepare("UPDATE mux_library_snapshot_state SET refreshed_at='1970-01-01T00:00:00.000Z' WHERE id='library'"),
  ];
  try { await sql.batch(statements); }
  catch {
    const saved = await replay(); if (saved) return saved;
    throw new ReplacementError('The swap could not be completed. Refresh and retry with the same replacement; the original video is retained.', 409);
  }
  return result;
}
