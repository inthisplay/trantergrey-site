import type { AdminEnvironment } from './admin';
import type { ApiActor } from './internal-api';

export class CardInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export type CardDraft = { title?: unknown; client?: unknown; columnSourceId?: unknown; notes?: unknown; requestId?: unknown; assignedTo?: unknown; dueOn?: unknown };

function field(value: unknown, name: string, max: number, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new CardInputError(`Enter a valid ${name} (up to ${max} characters).`);
  return value.trim();
}

// The request ledger, card, overrides, and audit record commit in one D1 transaction.
export async function createProductionCard(env: AdminEnvironment, draft: CardDraft, actor: Pick<ApiActor, 'type' | 'id' | 'name'>) {
  const input = {
    title: field(draft.title, 'title', 240, true),
    client: field(draft.client, 'client', 120),
    columnSourceId: field(draft.columnSourceId, 'column', 200, true),
    notes: field(draft.notes, 'notes', 100000),
    ...(draft.assignedTo !== undefined ? {assignedTo: field(draft.assignedTo, 'assignees', 2000)} : {}),
    ...(draft.dueOn !== undefined ? {dueOn: field(draft.dueOn, 'due date', 10)} : {}),
  };
  const assignees = [...new Set((input.assignedTo || '').split(',').map(name => name.trim()).filter(Boolean))];
  if (assignees.some(name => name.length > 120) || (input.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn))) throw new CardInputError('Check the assignees and due date.');
  const requestId = field(draft.requestId, 'request ID', 100, true);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) throw new CardInputError('Use a request ID of 16–100 letters, numbers, underscores, or hyphens.');
  const actorKey = `${actor.type}:${actor.id}`;
  const inputJson = JSON.stringify(input);
  const previous = () => env.TG_DATA.prepare('SELECT input_json, result_json FROM card_creation_requests WHERE actor_key = ? AND request_id = ?')
    .bind(actorKey, requestId).first<{ input_json: string; result_json: string }>();
  const replay = (row: { input_json: string; result_json: string }) => {
    if (row.input_json !== inputJson) throw new CardInputError('This request ID was already used for different card details.', 409);
    return { ...JSON.parse(row.result_json), created: false };
  };
  const existing = await previous();
  if (existing) return replay(existing);
  const column = await env.TG_DATA.prepare(`SELECT c.source_id FROM production_columns c LEFT JOIN production_column_overrides o ON o.column_source_id = c.source_id
    WHERE c.source_id = ? AND COALESCE(o.archived, 0) = 0`).bind(input.columnSourceId).first();
  if (!column) throw new CardInputError('Choose an existing, active Deck column.', 404);
  const now = new Date().toISOString();
  const sourceId = `local-${crypto.randomUUID()}`;
  const id = `local-card-${crypto.randomUUID()}`;
  const result = { id, sourceId, expectedUpdatedAt: now, title: input.title, client: input.client, columnSourceId: input.columnSourceId };
  const notesHtml = input.notes.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!).replace(/\r?\n/g, '<br>');
  try {
    await env.TG_DATA.batch([
      env.TG_DATA.prepare('INSERT INTO card_creation_requests (actor_key, request_id, input_json, result_json, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(actorKey, requestId, inputJson, JSON.stringify(result), now),
      env.TG_DATA.prepare(`INSERT INTO production_cards (id, source_id, column_source_id, position, title, description_html, archived, assignees_json, created_at, updated_at, source_json, imported_at)
        SELECT ?, ?, ?, COALESCE(MAX(COALESCE(o.position, p.position)), 0) + 1000, ?, '', 0, '[]', ?, ?, ?, ?
        FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id WHERE COALESCE(o.column_source_id, p.column_source_id) = ?`)
        .bind(id, sourceId, input.columnSourceId, input.title, now, now, JSON.stringify({ local: true, createdBy: actor.name, integrationActor: actorKey }), now, input.columnSourceId),
      env.TG_DATA.prepare(`INSERT INTO production_card_overrides (card_source_id, title, notes_html, client, assignees_json, due_on, column_source_id, archived, edited_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`).bind(sourceId, input.title, notesHtml || null, input.client, JSON.stringify(assignees), input.dueOn || '', input.columnSourceId, now),
      env.TG_DATA.prepare(`INSERT INTO production_card_activity (id, card_id, event_type, occurred_at, actor_type, actor_id, details_json) VALUES (?, ?, 'card_created', ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), id, now, actor.type, actor.id, JSON.stringify({ ...result, actorName: actor.name })),
      ...(input.client ? [env.TG_DATA.prepare('INSERT INTO client_directory (name, created_at) VALUES (?, ?) ON CONFLICT(name) DO NOTHING').bind(input.client, now)] : []),
    ]);
  } catch (error) {
    // A concurrent retry can win the unique request key while this transaction rolls back.
    const winner = await previous();
    if (winner) return replay(winner);
    throw error;
  }
  return { ...result, created: true };
}
