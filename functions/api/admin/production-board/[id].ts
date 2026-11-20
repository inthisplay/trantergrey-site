import { sanitizeProductionHtml } from '../../../../lib/production-html';
import { adminResponse, adminSession, type AdminEnvironment } from '../../../_lib/admin';
import { readClientDirectory, registerClient } from '../../../_lib/client-directory';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };

const noteText = (value: unknown) => String(value ?? '')
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<\/(?:p|div|li|blockquote|h[1-6])>/gi, '\n')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/\s+/g, ' ')
  .trim();

const hasRichStructure = (value: unknown) => /<(?:p|ul|ol|li|blockquote|strong|em|a|h[1-6]|table|pre)\b/i.test(String(value ?? ''));
const noteFingerprint = (value: unknown) => noteText(value).replace(/\s/g, '');
const preferPreservedNotes = (card: Record<string, unknown>) => {
  const source = card.source_notes_html;
  const local = card.local_notes_html || card.legacy_notes_html;
  // Older board saves flattened Basecamp notes while the untouched rich source
  // remains in production_cards. Restore the source only when both versions
  // say the same thing, never when a user actually changed the notes.
  if (source && local && hasRichStructure(source) && !hasRichStructure(local) && noteFingerprint(source) === noteFingerprint(local)) {
    return { ...card, notes_html: source };
  }
  return card;
};

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  const viewer = await adminSession(request, env);
  const storedCard = await env.TG_DATA.prepare(`SELECT p.*, s.attention, s.filming_on AS filmingOn, s.dismissed_at AS dismissedAt, p.description_html AS source_notes_html, o.notes_html AS local_notes_html, o.description_html AS legacy_notes_html, COALESCE(o.title, p.title) AS title, COALESCE(o.notes_html, o.description_html, p.description_html) AS notes_html,
    COALESCE(o.column_source_id, p.column_source_id) AS column_source_id, COALESCE(o.archived, p.archived) AS archived,
    COALESCE(o.client, '') AS client, COALESCE(o.assignees_json, p.assignees_json, '[]') AS assignees_json, COALESCE(o.due_on, p.due_on) AS due_on, o.edited_at
    FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id LEFT JOIN production_card_signals s ON s.card_source_id=p.source_id WHERE p.id = ? AND o.deleted_at IS NULL`).bind(params.id).first();
  if (!storedCard) return Response.json({ error: 'Production card not found.' }, { status: 404 });
  const card = preferPreservedNotes(storedCard as Record<string, unknown>) as Record<string, unknown>;
  for (const field of ['notes_html', 'description_html', 'source_notes_html', 'local_notes_html', 'legacy_notes_html']) {
    if (typeof card[field] === 'string') card[field] = sanitizeProductionHtml(card[field]);
  }
  const [steps, comments, events, attachments, columns, editLog, localComments, clients, teamMembers] = await Promise.all([
    env.TG_DATA.prepare('SELECT * FROM production_card_steps WHERE card_source_id = ? ORDER BY position, source_id').bind((card as { source_id: string }).source_id).all(),
    env.TG_DATA.prepare('SELECT * FROM production_comments WHERE card_source_id = ? ORDER BY created_at, source_id').bind((card as { source_id: string }).source_id).all(),
    env.TG_DATA.prepare('SELECT * FROM production_events WHERE card_source_id = ? ORDER BY occurred_at DESC, source_id DESC').bind((card as { source_id: string }).source_id).all(),
    env.TG_DATA.prepare('SELECT source_id AS sourceId, filename, content_type AS contentType, byte_size AS byteSize, status FROM production_attachments WHERE card_source_id = ? ORDER BY filename').bind((card as { source_id: string }).source_id).all(),
    env.TG_DATA.prepare('SELECT source_id AS sourceId, name, position FROM production_columns ORDER BY position, source_id').all(),
    env.TG_DATA.prepare('SELECT changed_at AS changedAt, actor, before_json AS beforeJson, after_json AS afterJson FROM production_card_edit_log WHERE card_source_id = ? ORDER BY changed_at DESC').bind((card as { source_id: string }).source_id).all(),
    env.TG_DATA.prepare('SELECT id, is_question AS isQuestion, question_resolved_at AS questionResolvedAt, body_html AS bodyHtml, body_json AS bodyJson, author_name AS authorName, author_email AS authorEmail, created_at AS createdAt, deleted_at AS deletedAt, deleted_by_name AS deletedByName FROM production_local_comments WHERE card_source_id = ? ORDER BY created_at, id').bind((card as { source_id: string }).source_id).all(),
    readClientDirectory(env),
    env.TG_DATA.prepare('SELECT nickname AS name FROM admin_team_directory').all<{ name: string }>(),
  ]);
  const assignees = [...new Set(teamMembers.results.map((member) => member.name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const safeComments = comments.results.map(row => {
    const comment = row as Record<string, unknown>;
    return { ...comment, body_html: sanitizeProductionHtml(comment.body_html) };
  });
  const safeLocalComments = localComments.results.map(row => {
    const comment = row as Record<string, unknown>;
    return { ...comment, bodyHtml: sanitizeProductionHtml(comment.bodyHtml) };
  });
  return Response.json({
    card, steps: steps.results, comments: safeComments, events: events.results,
    attachments: attachments.results, columns: columns.results, editLog: editLog.results,
    localComments: safeLocalComments, clients, assignees, viewer,
  });
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export async function onRequestPatch({ request, env, params }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  const body = await request.json().catch(() => null) as { title?: unknown; notes?: unknown; notesHtml?: unknown; client?: unknown; assignedTo?: unknown; dueOn?: unknown; columnSourceId?: unknown; archived?: unknown } | null;
  if (!body || typeof body.title !== 'string' || typeof body.notes !== 'string' || typeof body.client !== 'string' || typeof body.assignedTo !== 'string' || typeof body.dueOn !== 'string' || typeof body.columnSourceId !== 'string' || typeof body.archived !== 'boolean') {
    return Response.json({ error: 'Enter a title, client, assignees, due date, notes, status, and archive state.' }, { status: 400 });
  }
  const title = body.title.trim();
  const client = body.client.trim();
  const assignees = [...new Set(body.assignedTo.split(',').map((person) => person.trim()).filter(Boolean))];
  const dueOn = body.dueOn.trim();
  if (!title || title.length > 240 || client.length > 120 || assignees.some((person) => person.length > 120) || !/^\d{4}-\d{2}-\d{2}$/.test(dueOn) && dueOn !== '' || body.notes.length > 100000 || body.notesHtml !== undefined && (typeof body.notesHtml !== 'string' || body.notesHtml.length > 100000)) return Response.json({ error: 'Check the title, client, assignees, due date, and notes.' }, { status: 400 });
  const card = await env.TG_DATA.prepare('SELECT source_id, title, description_html, column_source_id, archived FROM production_cards WHERE id = ?').bind(params.id).first<{ source_id: string; title: string; description_html: string | null; column_source_id: string; archived: number }>();
  if (!card) return Response.json({ error: 'Production card not found.' }, { status: 404 });
  const column = await env.TG_DATA.prepare('SELECT source_id FROM production_columns WHERE source_id = ?').bind(body.columnSourceId).first();
  if (!column) return Response.json({ error: 'Choose a valid board column.' }, { status: 400 });
  const before = await env.TG_DATA.prepare(`SELECT COALESCE(o.title, p.title) AS title, COALESCE(o.notes_html, o.description_html, p.description_html) AS notes,
    COALESCE(o.client, '') AS client, COALESCE(o.assignees_json, p.assignees_json, '[]') AS assignees, COALESCE(o.due_on, p.due_on) AS dueOn,
    COALESCE(o.column_source_id, p.column_source_id) AS columnSourceId, COALESCE(o.archived, p.archived) AS archived
    FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id WHERE p.id = ?`).bind(params.id).first();
  const after = { title, notes: body.notes, client, assignees, dueOn, columnSourceId: body.columnSourceId, archived: body.archived ? 1 : 0 };
  // Retain Basecamp's original rich HTML if the editor's plain-text value is
  // unchanged. Changing another field must not silently flatten old notes.
  const notesHtml = typeof body.notesHtml === 'string'
    ? sanitizeProductionHtml(body.notesHtml)
    : noteFingerprint(card.description_html) === noteFingerprint(body.notes)
    ? null
    : body.notes ? escapeHtml(body.notes).replace(/\r?\n/g, '<br>') : '';
  after.notes = notesHtml ?? card.description_html ?? '';
  const previous = (before || {}) as Record<string, unknown>;
  const previousAssignees = (() => {
    try {
      const values = typeof previous.assignees === 'string' ? JSON.parse(previous.assignees) : previous.assignees;
      return Array.isArray(values) ? values.map((value: unknown) => typeof value === 'string' ? value : value && typeof value === 'object' && 'name' in value ? String(value.name) : '').filter(Boolean).sort() : [];
    } catch { return []; }
  })();
  const unchanged = ['title', 'notes', 'client', 'dueOn', 'columnSourceId'].every((key) => String(previous[key] ?? '') === String(after[key as keyof typeof after] ?? ''))
    && Number(previous.archived || 0) === after.archived && JSON.stringify(previousAssignees) === JSON.stringify([...assignees].sort());
  if (unchanged) return onRequestGet({ request, env, params });
  const actor = (await adminSession(request, env))?.name || 'Admin';
  const editedAt = new Date().toISOString();
  await env.TG_DATA.batch([
    env.TG_DATA.prepare(`INSERT INTO production_card_overrides (card_source_id, title, notes_html, client, assignees_json, due_on, column_source_id, archived, edited_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(card_source_id) DO UPDATE SET title = excluded.title, notes_html = excluded.notes_html,
      client = excluded.client, assignees_json = excluded.assignees_json, due_on = excluded.due_on, column_source_id = excluded.column_source_id, archived = excluded.archived, edited_at = excluded.edited_at`)
      .bind(card.source_id, title, notesHtml, client, JSON.stringify(assignees), dueOn, body.columnSourceId, after.archived, editedAt),
    env.TG_DATA.prepare('INSERT INTO production_card_edit_log (id, card_source_id, changed_at, actor, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), card.source_id, editedAt, actor, JSON.stringify(before || {}), JSON.stringify(after)),
  ]);
  if (client) await registerClient(env, client);
  return onRequestGet({ request, env, params });
}

export async function onRequestDelete({ request, env, params }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  const card = await env.TG_DATA.prepare('SELECT source_id FROM production_cards WHERE id = ?').bind(params.id).first<{ source_id: string }>();
  if (!card) return Response.json({ error: 'Production card not found.' }, { status: 404 });
  const actor = (await adminSession(request, env))?.name || 'Admin';
  const now = new Date().toISOString();
  await env.TG_DATA.batch([
    env.TG_DATA.prepare(`INSERT INTO production_card_overrides (card_source_id, edited_at, deleted_at)
      VALUES (?, ?, ?) ON CONFLICT(card_source_id) DO UPDATE SET deleted_at = excluded.deleted_at, edited_at = excluded.edited_at`).bind(card.source_id, now, now),
    env.TG_DATA.prepare('INSERT INTO production_card_edit_log (id, card_source_id, changed_at, actor, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), card.source_id, now, actor, '{}', JSON.stringify({ deleted: true })),
  ]);
  return Response.json({ ok: true });
}
