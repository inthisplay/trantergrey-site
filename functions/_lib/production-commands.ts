import type { AdminEnvironment } from './admin';

export function escapeHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

export async function moveProductionCard(env: AdminEnvironment, cardId: string, input: { columnSourceId?: unknown; beforeCardId?: unknown }, actor: string) {
  if (typeof input.columnSourceId !== 'string' || !input.columnSourceId) throw new Error('Choose a valid board column.');
  if (input.beforeCardId !== undefined && typeof input.beforeCardId !== 'string') throw new Error('Choose a valid card placement.');
  const card = await env.TG_DATA.prepare(`SELECT p.source_id AS sourceId, COALESCE(o.column_source_id, p.column_source_id) AS columnSourceId, COALESCE(o.position, p.position) AS position
    FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id WHERE p.id = ?`).bind(cardId).first<{ sourceId: string; columnSourceId: string; position: number | null }>();
  if (!card) throw new Error('Production card not found.');
  const column = await env.TG_DATA.prepare('SELECT source_id FROM production_columns WHERE source_id = ?').bind(input.columnSourceId).first();
  if (!column) throw new Error('Choose a valid board column.');
  const siblings = await env.TG_DATA.prepare(`SELECT p.id, p.source_id AS sourceId, COALESCE(o.position, p.position) AS position FROM production_cards p
    LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id WHERE COALESCE(o.column_source_id, p.column_source_id) = ? AND p.id != ?
    ORDER BY CASE WHEN COALESCE(o.position, p.position) IS NULL THEN 1 ELSE 0 END, COALESCE(o.position, p.position), p.created_at`).bind(input.columnSourceId, cardId).all<{ id: string; sourceId: string; position: number | null }>();
  const beforeIndex = input.beforeCardId ? siblings.results.findIndex((sibling) => sibling.id === input.beforeCardId) : -1;
  if (input.beforeCardId && beforeIndex < 0) throw new Error('Choose a valid card placement.');
  const placementIndex = beforeIndex < 0 ? siblings.results.length : beforeIndex;
  const orderedCards = [...siblings.results]; orderedCards.splice(placementIndex, 0, { id: cardId, sourceId: card.sourceId, position: null });
  const position = (placementIndex + 1) * 1000;
  if (card.columnSourceId === input.columnSourceId && card.position === position) return { moved: false, columnSourceId: card.columnSourceId, position };
  const changedAt = new Date().toISOString();
  const statements = [
    ...orderedCards.map((item, index) => env.TG_DATA.prepare(`INSERT INTO production_card_overrides (card_source_id, column_source_id, position, edited_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(card_source_id) DO UPDATE SET column_source_id = excluded.column_source_id, position = excluded.position, edited_at = excluded.edited_at`).bind(item.sourceId, input.columnSourceId, (index + 1) * 1000, changedAt)),
    env.TG_DATA.prepare('INSERT INTO production_card_edit_log (id, card_source_id, changed_at, actor, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), card.sourceId, changedAt, actor, JSON.stringify({ columnSourceId: card.columnSourceId, position: card.position }), JSON.stringify({ columnSourceId: input.columnSourceId, position })),
  ];
  for (let start = 0; start < statements.length; start += 75) await env.TG_DATA.batch(statements.slice(start, start + 75));
  return { moved: true, columnSourceId: input.columnSourceId, position };
}

export async function addProductionComment(env: AdminEnvironment, cardId: string, input: { bodyHtml: string; bodyJson: string }, actor: { name: string; email: string | null }) {
  if (!input.bodyHtml.replace(/<[^>]*>/g, '').trim() || input.bodyJson.length > 10_000) throw new Error('Enter a comment under 10,000 characters.');
  const card = await env.TG_DATA.prepare('SELECT source_id FROM production_cards WHERE id = ?').bind(cardId).first<{ source_id: string }>();
  if (!card) throw new Error('Production card not found.');
  const localComment = { id: crypto.randomUUID(), bodyHtml: input.bodyHtml, bodyJson: input.bodyJson, authorName: actor.name, authorEmail: actor.email, createdAt: new Date().toISOString() };
  await env.TG_DATA.prepare('INSERT INTO production_local_comments (id, card_source_id, body_html, body_json, author_name, author_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(localComment.id, card.source_id, localComment.bodyHtml, localComment.bodyJson, localComment.authorName, localComment.authorEmail, localComment.createdAt).run();
  return localComment;
}
