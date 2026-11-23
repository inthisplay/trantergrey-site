import { hasCommentQuestion } from '../../lib/comment-question';
import { mergedFilmingDatesSql } from './filming-dates';
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
  const [updatedCard, countRows] = await Promise.all([
    env.TG_DATA.prepare(`SELECT p.id, COALESCE(o.title, p.title) AS title, COALESCE(o.client, '') AS client,
      COALESCE(o.column_source_id, p.column_source_id) AS columnSourceId, COALESCE(o.due_on, p.due_on) AS dueOn
      FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id WHERE p.id = ?`).bind(cardId).first(),
    env.TG_DATA.prepare(`SELECT COALESCE(o.column_source_id, p.column_source_id) AS columnSourceId, COUNT(*) AS cardCount
      FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id
      WHERE COALESCE(o.column_source_id, p.column_source_id) IN (?, ?) GROUP BY COALESCE(o.column_source_id, p.column_source_id)`)
      .bind(card.columnSourceId, input.columnSourceId).all<{ columnSourceId: string; cardCount: number }>(),
  ]);
  return { moved: true, columnSourceId: input.columnSourceId, position, card: updatedCard, counts: Object.fromEntries(countRows.results.map((row) => [row.columnSourceId, row.cardCount])) };
}

export async function addProductionComment(env: AdminEnvironment, cardId: string, input: { bodyHtml: string; bodyJson: string; signal?: { attention?: string; filmingOn?: string; filmingDates?: string[]; dueOn?: string } }, actor: { name: string; email: string | null }) {
  if (!input.bodyHtml.replace(/<[^>]*>/g, '').trim() || input.bodyJson.length > 10_000) throw new Error('Enter a comment under 10,000 characters.');
  const card = await env.TG_DATA.prepare('SELECT source_id FROM production_cards WHERE id = ?').bind(cardId).first<{ source_id: string }>();
  if (!card) throw new Error('Production card not found.');
  const localComment = { id: crypto.randomUUID(), bodyHtml: input.bodyHtml, bodyJson: input.bodyJson, authorName: actor.name, authorEmail: actor.email, createdAt: new Date().toISOString(), isQuestion: hasCommentQuestion(input.bodyHtml) ? 1 : 0, questionResolvedAt: null };
  const insert = env.TG_DATA.prepare('INSERT INTO production_local_comments (id, card_source_id, body_html, body_json, author_name, author_email, created_at, is_question) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(localComment.id, card.source_id, localComment.bodyHtml, localComment.bodyJson, localComment.authorName, localComment.authorEmail, localComment.createdAt, localComment.isQuestion);
  if (input.signal) {
    const signal = input.signal;
    await env.TG_DATA.batch([insert, ...(signal.dueOn ? [env.TG_DATA.prepare(`INSERT INTO production_card_overrides(card_source_id,due_on,edited_at) VALUES(?,?,?) ON CONFLICT(card_source_id) DO UPDATE SET due_on=excluded.due_on,edited_at=excluded.edited_at`).bind(card.source_id, signal.dueOn, localComment.createdAt)] : []), env.TG_DATA.prepare(`INSERT INTO production_card_signals(card_source_id,attention,filming_on) VALUES(?,?,?) ON CONFLICT(card_source_id) DO UPDATE SET attention=CASE WHEN ? THEN excluded.attention ELSE production_card_signals.attention END,filming_on=CASE WHEN ? THEN ${mergedFilmingDatesSql} ELSE production_card_signals.filming_on END`).bind(card.source_id, signal.attention || '', JSON.stringify(signal.filmingDates || (signal.filmingOn ? [signal.filmingOn] : [])), signal.attention !== undefined ? 1 : 0, (signal.filmingDates !== undefined || signal.filmingOn !== undefined) ? 1 : 0)]);
  } else await insert.run();
  return localComment;
}
