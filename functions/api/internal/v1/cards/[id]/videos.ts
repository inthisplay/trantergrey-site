import { apiData, apiError, requireApiScope } from '../../../../../_lib/internal-api';
import { getMuxLibraryAsset } from '../../../../../_lib/mux';
import type { AdminEnvironment } from '../../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };
type Ingest = { requestedAt: string | null; uploaderName: string | null; uploaderEmail: string | null };
type Link = { id: string; assetId: string; linkedAt: string; sourceUploadedAt: string | null };

export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  const actor = await requireApiScope(request, env, 'associations:write'); if (actor instanceof Response) return actor;
  const body = await request.json().catch(() => null) as { assetId?: unknown } | null;
  if (!body || typeof body.assetId !== 'string' || !/^[A-Za-z0-9]+$/.test(body.assetId)) return apiError('invalid_video_id', 'Choose a valid Mux asset ID.', 400);
  const card = await env.TG_DATA.prepare('SELECT id FROM production_cards WHERE id = ?').bind(params.id).first<{ id: string }>();
  if (!card) return apiError('card_not_found', 'Card not found.', 404);
  try {
    const [asset, ingest] = await Promise.all([
      getMuxLibraryAsset(env, body.assetId),
      env.TG_DATA.prepare('SELECT requested_at AS requestedAt, uploader_name AS uploaderName, uploader_email AS uploaderEmail FROM mux_asset_ingests WHERE asset_id = ?').bind(body.assetId).first<Ingest>(),
    ]);
    const linkId = crypto.randomUUID(); const occurredAt = new Date().toISOString();
    const details = JSON.stringify({ title: asset.title, playerUrl: asset.playerUrl, sourceUploadedAt: ingest?.requestedAt || asset.createdAt || null });
    await env.TG_DATA.batch([
      env.TG_DATA.prepare(`INSERT INTO production_card_video_links (id, card_id, asset_id, linked_at, linked_by_type, linked_by_id, source_uploaded_at, uploader_name, uploader_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(card_id, asset_id) DO NOTHING`)
        .bind(linkId, params.id, asset.id, occurredAt, actor.type, actor.id, ingest?.requestedAt || asset.createdAt, ingest?.uploaderName || null, ingest?.uploaderEmail || null),
      env.TG_DATA.prepare(`INSERT INTO production_card_activity (id, card_id, event_type, occurred_at, actor_type, actor_id, asset_id, details_json, link_id)
        SELECT ?, card_id, 'video_linked', ?, ?, ?, asset_id, ?, id FROM production_card_video_links WHERE card_id = ? AND asset_id = ?
        ON CONFLICT(link_id, event_type) DO NOTHING`)
        .bind(crypto.randomUUID(), occurredAt, actor.type, actor.id, details, params.id, asset.id),
    ]);
    const link = await env.TG_DATA.prepare('SELECT id, asset_id AS assetId, linked_at AS linkedAt, source_uploaded_at AS sourceUploadedAt FROM production_card_video_links WHERE card_id = ? AND asset_id = ?').bind(params.id, asset.id).first<Link>();
    return apiData({ link, created: link?.id === linkId }, undefined, link?.id === linkId ? 201 : 200);
  } catch (error) { return apiError('video_link_failed', error instanceof Error ? error.message : 'Unable to link the video.', 502); }
}
