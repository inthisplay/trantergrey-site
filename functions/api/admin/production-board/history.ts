import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { presentHistory, type HistoryRow } from '../../../_lib/deck-history';

export async function onRequestGet({ request, env }: { request: Request; env: AdminEnvironment }): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') || 'all';
  const limit = Number(url.searchParams.get('limit') || 25);
  if (!['all', 'updates', 'moves', 'management'].includes(filter) || !Number.isInteger(limit) || limit < 1 || limit > 50) return Response.json({ error: 'Choose a valid history filter and page size.' }, { status: 400 });
  const clientId=url.searchParams.get('client');
  const client=clientId ? await env.TG_DATA.prepare('SELECT id,name FROM client_directory WHERE id=?').bind(clientId).first<{id:string;name:string}>() : null;
  if(clientId && !client)return Response.json({error:'Client not found.'},{status:404});
  const conditions: string[] = [], args: unknown[] = [];
  let source='production_deck_history';
  if(client){
    source=`(SELECT h.id,h.source_kind,h.source_id,h.card_source_id,h.column_source_id,h.occurred_at,h.actor,h.action,h.category,h.summary,h.body_html,h.details_json,h.redacted
      FROM production_deck_history h JOIN production_card_overrides o ON o.card_source_id=h.card_source_id WHERE o.client=? COLLATE NOCASE
      UNION ALL SELECT id,'client',id,NULL,NULL,occurred_at,actor,action,category,summary,'','{}',0 FROM client_activity WHERE client_id=?)`;
    args.push(client.name,client.id);
  }
  if (filter !== 'all') { conditions.push('h.category = ?'); args.push(filter); }
  const cursor = url.searchParams.get('cursor');
  if (cursor) {
    try {
      if (cursor.length > 2048) throw new Error();
      const value = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')));
      if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'string' || typeof value[1] !== 'string' || !value[1] || value[1].length > 512 || (value[0] !== '' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value[0]))) throw new Error();
      conditions.push('(h.occurred_at, h.id) < (?, ?)'); args.push(...value);
    } catch { return Response.json({ error: 'Invalid history cursor. Refresh the timeline.' }, { status: 400 }); }
  }
  const rows = await env.TG_DATA.prepare(`SELECT h.*, p.id AS cardId, COALESCE(o.title,p.title) AS cardTitle,
    COALESCE(co.name,c.name) AS columnName, co.color AS columnColor,
    COALESCE(fc.name,f.name) AS fromColumn, COALESCE(tc.name,t.name) AS toColumn
    FROM ${source} h
    LEFT JOIN production_cards p ON p.source_id=h.card_source_id
    LEFT JOIN production_card_overrides o ON o.card_source_id=p.source_id
    LEFT JOIN production_columns c ON c.source_id=COALESCE(h.column_source_id,o.column_source_id,p.column_source_id)
    LEFT JOIN production_column_overrides co ON co.column_source_id=c.source_id
    LEFT JOIN production_columns f ON f.source_id=json_extract(h.details_json,'$.before.columnSourceId')
    LEFT JOIN production_column_overrides fc ON fc.column_source_id=f.source_id
    LEFT JOIN production_columns t ON t.source_id=json_extract(h.details_json,'$.after.columnSourceId')
    LEFT JOIN production_column_overrides tc ON tc.column_source_id=t.source_id
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY h.occurred_at DESC,h.id DESC LIMIT ?`).bind(...args, limit + 1).all<HistoryRow>();
  const selected = rows.results.slice(0, limit), last = selected.at(-1);
  const nextCursor = rows.results.length > limit && last ? btoa(JSON.stringify([last.occurred_at, last.id])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null;
  return Response.json({ events: selected.map(presentHistory), nextCursor }, { headers: { 'Cache-Control': 'private, no-store' } });
}
