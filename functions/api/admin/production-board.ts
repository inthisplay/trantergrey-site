import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { readEnrichedMuxLibrary } from '../../_lib/mux-library';

type Context = { request: Request; env: AdminEnvironment };
type Row = { sourceId: string; name: string; position: number | null; cardsCount: number };

const assigneeName = (value: unknown): string | null => {
  if (typeof value === 'string') return value.trim() || null;
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of ['name', 'full_name', 'display_name', 'person_name']) {
    if (typeof record[key] === 'string' && record[key].trim()) return record[key].trim();
  }
  return null;
};
const archiveAssigneeNames = (value: unknown) => {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(assigneeName).filter((name): name is string => Boolean(name)) : [];
  } catch { return []; }
};

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  const columns = await env.TG_DATA.prepare(`SELECT c.source_id AS sourceId, COALESCE(co.name, c.name) AS name, c.position, COUNT(p.source_id) AS cardsCount
    FROM production_columns c LEFT JOIN production_column_overrides co ON co.column_source_id = c.source_id
    LEFT JOIN production_cards p ON COALESCE((SELECT o.column_source_id FROM production_card_overrides o WHERE o.card_source_id = p.source_id), p.column_source_id) = c.source_id
    WHERE COALESCE(co.archived, 0) = 0 GROUP BY c.source_id ORDER BY CASE WHEN c.position IS NULL THEN 0 ELSE 1 END, c.position, c.source_id`).all<Row>();
  const [cards, muxLibrary, assigneeRows, signedInMembers] = await Promise.all([
    env.TG_DATA.prepare(`SELECT p.id, p.source_id AS sourceId, COALESCE(o.column_source_id, p.column_source_id) AS columnSourceId, COALESCE(o.position, p.position) AS position,
    COALESCE(o.title, p.title) AS title, COALESCE(o.client, '') AS client, COALESCE(o.archived, p.archived) AS archived, p.created_at AS createdAt, COALESCE(o.edited_at, p.updated_at, p.created_at) AS updatedAt, p.due_on AS dueOn, p.completed_at AS completedAt, o.edited_at AS editedAt
    , (SELECT COUNT(*) FROM production_comments pc WHERE pc.card_source_id = p.source_id) + (SELECT COUNT(*) FROM production_local_comments plc WHERE plc.card_source_id = p.source_id) AS commentsCount
    FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id
    ORDER BY COALESCE(o.column_source_id, p.column_source_id), CASE WHEN COALESCE(o.position, p.position) IS NULL THEN 1 ELSE 0 END, COALESCE(o.position, p.position), p.created_at`).all(),
    readEnrichedMuxLibrary(env).catch(() => null),
    env.TG_DATA.prepare('SELECT assignees_json AS assigneesJson FROM production_cards UNION SELECT assignees_json AS assigneesJson FROM production_card_overrides').all<{ assigneesJson: string | null }>(),
    env.TG_DATA.prepare('SELECT DISTINCT user_name AS name FROM admin_sessions WHERE user_name IS NOT NULL AND TRIM(user_name) != ?').bind('').all<{ name: string }>(),
  ]);
  const clients = [...new Set((muxLibrary?.assets ?? []).map((asset) => asset.client).filter((client): client is string => Boolean(client)))].sort((a, b) => a.localeCompare(b));
  const assignees = [...new Set([...assigneeRows.results.flatMap((row) => archiveAssigneeNames(row.assigneesJson)), ...signedInMembers.results.map((member) => member.name.trim()).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
  return Response.json({ columns: columns.results, cards: cards.results, clients, assignees });
}
