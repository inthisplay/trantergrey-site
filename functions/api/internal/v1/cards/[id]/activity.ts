import { apiData, apiError, requireApiScope } from '../../../../../_lib/internal-api';
import type { AdminEnvironment } from '../../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };
type ApiEvent = { eventType: string; occurredAt: string; actorType: string; actorId: string; assetId: string | null; detailsJson: string };
type Edit = { occurredAt: string; actor: string; beforeJson: string; afterJson: string };
type Comment = { occurredAt: string; authorName: string; authorEmail: string | null };
type ImportedEvent = { eventType: string | null; occurredAt: string | null; summary: string | null };

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  const access = await requireApiScope(request, env, 'cards:read'); if (access instanceof Response) return access;
  const card = await env.TG_DATA.prepare('SELECT source_id AS sourceId FROM production_cards WHERE id = ?').bind(params.id).first<{ sourceId: string }>();
  if (!card) return apiError('card_not_found', 'Card not found.', 404);
  const [apiEvents, edits, comments, imported] = await Promise.all([
    env.TG_DATA.prepare('SELECT id, event_type AS eventType, occurred_at AS occurredAt, actor_type AS actorType, actor_id AS actorId, asset_id AS assetId, details_json AS detailsJson FROM production_card_activity WHERE card_id = ? ORDER BY occurred_at DESC').bind(params.id).all<ApiEvent>(),
    env.TG_DATA.prepare('SELECT id, changed_at AS occurredAt, actor, before_json AS beforeJson, after_json AS afterJson FROM production_card_edit_log WHERE card_source_id = ? ORDER BY changed_at DESC').bind(card.sourceId).all<Edit>(),
    env.TG_DATA.prepare('SELECT id, created_at AS occurredAt, author_name AS authorName, author_email AS authorEmail FROM production_local_comments WHERE card_source_id = ? AND deleted_at IS NULL ORDER BY created_at DESC').bind(card.sourceId).all<Comment>(),
    env.TG_DATA.prepare('SELECT source_id AS id, occurred_at AS occurredAt, event_type AS eventType, summary FROM production_events WHERE card_source_id = ? ORDER BY occurred_at DESC').bind(card.sourceId).all<ImportedEvent>(),
  ]);
  const events = [
    ...apiEvents.results.map((event) => ({ type: event.eventType, occurredAt: event.occurredAt, actor: { type: event.actorType, id: event.actorId }, assetId: event.assetId, details: JSON.parse(String(event.detailsJson || '{}')) })),
    ...edits.results.map((event) => ({ type: 'card_updated', occurredAt: event.occurredAt, actor: { type: 'user', id: event.actor }, details: { before: event.beforeJson, after: event.afterJson } })),
    ...comments.results.map((event) => ({ type: 'comment_added', occurredAt: event.occurredAt, actor: { type: 'user', id: event.authorEmail || event.authorName } })),
    ...imported.results.map((event) => ({ type: event.eventType || 'imported_event', occurredAt: event.occurredAt, details: { summary: event.summary } })),
  ].sort((left, right) => String(right.occurredAt || '').localeCompare(String(left.occurredAt || '')));
  return apiData(events);
}
