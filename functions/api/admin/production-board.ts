import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { readClientDirectory } from '../../_lib/client-directory';

type Context = { request: Request; env: AdminEnvironment };
type Row = { sourceId: string; name: string; color: string | null; position: number | null; cardsCount: number };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  const columns = await env.TG_DATA.prepare(`SELECT c.source_id AS sourceId, COALESCE(co.name, c.name) AS name, co.color, c.position, COUNT(p.source_id) AS cardsCount
    FROM production_columns c LEFT JOIN production_column_overrides co ON co.column_source_id = c.source_id
    LEFT JOIN production_cards p ON COALESCE((SELECT o.column_source_id FROM production_card_overrides o WHERE o.card_source_id = p.source_id), p.column_source_id) = c.source_id
    WHERE COALESCE(co.archived, 0) = 0 GROUP BY c.source_id ORDER BY CASE WHEN c.position IS NULL THEN 0 ELSE 1 END, c.position, c.source_id`).all<Row>();
  const [cards, clients, teamMembers] = await Promise.all([
    env.TG_DATA.prepare(`SELECT p.id, p.source_id AS sourceId, COALESCE(o.column_source_id, p.column_source_id) AS columnSourceId, COALESCE(o.position, p.position) AS position,
    COALESCE(o.title, p.title) AS title, COALESCE(o.client, '') AS client, COALESCE(o.archived, p.archived) AS archived, p.created_at AS createdAt, COALESCE(o.edited_at, p.updated_at, p.created_at) AS updatedAt, COALESCE(o.due_on, p.due_on) AS dueOn, p.completed_at AS completedAt, o.edited_at AS editedAt, s.attention, s.filming_on AS filmingOn, s.dismissed_at AS dismissedAt,
    local_comments.muxAddedAt,
    (SELECT json_object('id',q.id,'author',q.author_name) FROM production_local_comments q WHERE q.card_source_id=p.source_id AND q.is_question=1 AND q.question_resolved_at IS NULL AND q.deleted_at IS NULL ORDER BY q.created_at DESC,q.id DESC LIMIT 1) AS openQuestion,
    (SELECT MAX(g.created_at) FROM production_gallery g WHERE g.card_source_id=p.source_id AND g.deleted_at IS NULL) AS galleryAddedAt
    , COALESCE(base_comments.count, 0) + COALESCE(local_comments.count, 0) AS commentsCount
    FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id
    LEFT JOIN production_card_signals s ON s.card_source_id=p.source_id
    LEFT JOIN (SELECT card_source_id, COUNT(*) AS count FROM production_comments GROUP BY card_source_id) base_comments ON base_comments.card_source_id = p.source_id
    LEFT JOIN (SELECT card_source_id, COUNT(*) AS count, MAX(CASE WHEN body_html LIKE '%class="production-comment-mux-asset"%' THEN created_at END) AS muxAddedAt FROM production_local_comments WHERE deleted_at IS NULL GROUP BY card_source_id) local_comments ON local_comments.card_source_id = p.source_id
    WHERE o.deleted_at IS NULL
    ORDER BY COALESCE(o.column_source_id, p.column_source_id), CASE WHEN COALESCE(o.position, p.position) IS NULL THEN 1 ELSE 0 END, COALESCE(o.position, p.position), p.created_at`).all(),
    readClientDirectory(env),
    env.TG_DATA.prepare('SELECT nickname AS name FROM admin_team_directory').all<{ name: string }>(),
  ]);
  const assignees = [...new Set(teamMembers.results.map((member) => member.name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return Response.json({ columns: columns.results, cards: cards.results, clients, assignees });
}
