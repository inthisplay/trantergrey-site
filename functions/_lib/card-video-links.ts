import type { AdminEnvironment } from './admin';
import type { ApiActor } from './internal-api';
import { getMuxLibraryAsset } from './mux';
import { slateHtml } from '../../lib/production-comment-html';
type Ingest = { requestedAt: string | null; uploaderName: string | null; uploaderEmail: string | null };
type Link = { id: string; assetId: string; linkedAt: string; sourceUploadedAt: string | null };

export class VideoLinkError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function linkCardVideo(env: AdminEnvironment, cardId: string, assetId: string, actor: ApiActor, addComment: boolean) {
  const card = await env.TG_DATA.prepare('SELECT p.id, p.source_id FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id=p.source_id WHERE p.id = ? AND o.deleted_at IS NULL').bind(cardId).first<{ id: string; source_id: string }>();
  if (!card) throw new VideoLinkError('Card not found.', 404);
  const [asset, ingest] = await Promise.all([
    getMuxLibraryAsset(env, assetId),
    env.TG_DATA.prepare('SELECT requested_at AS requestedAt, uploader_name AS uploaderName, uploader_email AS uploaderEmail FROM mux_asset_ingests WHERE asset_id = ?').bind(assetId).first<Ingest>(),
  ]);
  if (addComment && (!asset.playerUrl || asset.playbackPolicy !== 'public')) throw new VideoLinkError('This video has no public playable version. Playback visibility was not changed.', 409);
  const commentBody = [{ type: 'mux-asset', assetId: asset.id, itemKind: 'video', title: asset.title, duration: asset.duration, thumbnailUrl: asset.thumbnailUrl, media: [{ id: asset.id, title: asset.title, playerUrl: asset.playerUrl, thumbnailUrl: asset.thumbnailUrl }], children: [{ text: '' }] }];
  const linkId = crypto.randomUUID(); const occurredAt = new Date().toISOString();
  const details = JSON.stringify({ title: asset.title, playerUrl: asset.playerUrl, sourceUploadedAt: ingest?.requestedAt || asset.createdAt || null });
  await env.TG_DATA.batch([
    env.TG_DATA.prepare(`INSERT INTO production_card_video_links (id, card_id, asset_id, linked_at, linked_by_type, linked_by_id, source_uploaded_at, uploader_name, uploader_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(card_id, asset_id) DO NOTHING`)
      .bind(linkId, cardId, asset.id, occurredAt, actor.type, actor.id, ingest?.requestedAt || asset.createdAt, ingest?.uploaderName || null, ingest?.uploaderEmail || null),
    env.TG_DATA.prepare(`INSERT INTO production_card_activity (id, card_id, event_type, occurred_at, actor_type, actor_id, asset_id, details_json, link_id)
      SELECT ?, card_id, 'video_linked', ?, ?, ?, asset_id, ?, id FROM production_card_video_links WHERE card_id = ? AND asset_id = ?
      ON CONFLICT(link_id, event_type) DO NOTHING`)
      .bind(crypto.randomUUID(), occurredAt, actor.type, actor.id, details, cardId, asset.id),
    ...(addComment ? [
      env.TG_DATA.prepare(`INSERT INTO production_local_comments (id,card_source_id,body_html,body_json,author_name,author_email,created_at,is_question)
        SELECT 'video-link-' || id, ?, ?, ?, ?, ?, ?, 0 FROM production_card_video_links WHERE card_id=? AND asset_id=?
        ON CONFLICT(id) DO NOTHING`).bind(card.source_id, slateHtml(commentBody), JSON.stringify(commentBody), actor.name, actor.email, occurredAt, cardId, asset.id),
      env.TG_DATA.prepare(`INSERT INTO production_card_activity(id,card_id,event_type,occurred_at,actor_type,actor_id,asset_id,details_json,link_id)
        SELECT ?,card_id,'video_comment_added',?,?,?,?,?,id FROM production_card_video_links WHERE card_id=? AND asset_id=?
        ON CONFLICT(link_id,event_type) DO NOTHING`).bind(crypto.randomUUID(),occurredAt,actor.type,actor.id,asset.id,'{}',cardId,asset.id),
    ] : []),
  ]);
  const link = await env.TG_DATA.prepare('SELECT id, asset_id AS assetId, linked_at AS linkedAt, source_uploaded_at AS sourceUploadedAt FROM production_card_video_links WHERE card_id = ? AND asset_id = ?').bind(cardId, asset.id).first<Link>();
  const comment = addComment && link ? await env.TG_DATA.prepare('SELECT id, deleted_at AS deletedAt FROM production_local_comments WHERE id=?').bind('video-link-' + link.id).first<{ id: string; deletedAt: string | null }>() : null;
  return { link, created: link?.id === linkId, comment: comment ? { id: comment.id, deleted: Boolean(comment.deletedAt) } : null };
}
