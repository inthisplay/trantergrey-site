import type { ApiActor } from './internal-api';
import type { AdminEnvironment } from './admin';
import { sanitizeClientNote, readClientNoteValue, clientNoteHtml } from '../../lib/client-note';
import { clientActivity } from './client-activity';

export class ClientItemError extends Error { constructor(message: string, public status = 400) { super(message); } }
export { ClientItemError as ToolError };
type Item = { id: string; workspace_id: string; kind: string; title: string; body: string; body_format: string; body_json: string | null; completed: number; assignee: string; due_on: string; updated_at: string };
type Fields = { title?: string; body?: string; assignee?: string; dueOn?: string; bodyFormat?: 'text' | 'html'; bodyJson?: string | null };
export async function clientItem(env: AdminEnvironment, clientId: string, itemId: string) {
  const item = await env.TG_DATA.prepare('SELECT * FROM client_workspace_items WHERE workspace_id=? AND id=?').bind(clientId, itemId).first<Item>();
  if (!item) throw new ClientItemError('Item not found in this client workspace.', 404);
  return item;
}
async function validate(env: AdminEnvironment, clientId: string, fields: Fields, existing?: Item) {
  for (const [key, max] of [['title',240],['body',50000],['assignee',120],['dueOn',10]] as const) {
    const value = fields[key];
    if (value !== undefined && (typeof value !== 'string' || value.length > max || (key === 'title' && !value.trim()))) throw new ClientItemError(`Invalid ${key}.`);
  }
  if (!await env.TG_DATA.prepare('SELECT id FROM client_directory WHERE id=?').bind(clientId).first()) throw new ClientItemError('Client not found.', 404);
  if (fields.assignee && fields.assignee !== existing?.assignee) {
    const team = await env.TG_DATA.prepare('SELECT nickname FROM admin_team_directory').all<{ nickname: string }>();
    if (fields.assignee.split(',').some(name => !team.results.some(member => member.nickname === name.trim()))) throw new ClientItemError('Choose exact assignee names returned by get_client_workspace.');
  }
  if (fields.dueOn && (!/^\d{4}-\d{2}-\d{2}$/.test(fields.dueOn) || Number.isNaN(Date.parse(fields.dueOn)) || new Date(fields.dueOn).toISOString().slice(0, 10) !== fields.dueOn)) throw new ClientItemError('Use a valid calendar date YYYY-MM-DD.');
}
function noteContent(fields: Fields, kind: string) {
  const supplied = fields.body !== undefined || fields.bodyJson !== undefined || fields.bodyFormat !== undefined;
  if (!supplied) return null;
  if (fields.bodyJson != null) {
    if (kind !== 'note' || typeof fields.bodyJson !== 'string') throw new ClientItemError('Invalid note content.');
    try { readClientNoteValue(fields.bodyJson); } catch { throw new ClientItemError('Invalid note content.'); }
    return { body: clientNoteHtml({ body_json: fields.bodyJson }), format: 'html', json: fields.bodyJson };
  }
  if (fields.body === undefined) throw new ClientItemError('Include body when replacing note content.');
  if (fields.bodyFormat !== undefined && !['text','html'].includes(fields.bodyFormat)) throw new ClientItemError('Invalid body format.');
  const html = kind === 'note' && fields.bodyFormat === 'html';
  return { body: html ? sanitizeClientNote(fields.body) : fields.body, format: html ? 'html' : 'text', json: null };
}
export async function createItem(env: AdminEnvironment, request: Request, input: Fields & { clientId: string; kind: 'todo' | 'note'; title: string; requestId: string }, actor: ApiActor) {
  if (!['todo','note'].includes(input.kind) || typeof input.title !== 'string' || !input.title.trim()) throw new ClientItemError('Choose a kind and title.');
  if (typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestId)) throw new ClientItemError('A requestId UUID is required. Refresh the page if needed.', 428);
  const content = noteContent(input, input.kind) || { body: '', format: 'text', json: null };
  const requestKey = actor.id === 'chatgpt-personal-mcp' ? input.requestId : `${actor.id}:${input.requestId}`;
  const payload = JSON.stringify({ clientId: input.clientId, kind: input.kind, title: input.title, body: input.body || '', assignee: input.assignee || '', dueOn: input.dueOn || '', ...(content.format === 'html' ? { bodyFormat: content.format, bodyJson: content.json } : {}) });
  const previous = async () => {
    const row = await env.TG_DATA.prepare('SELECT payload,result_json FROM mcp_item_requests WHERE request_id=?').bind(requestKey).first<{ payload: string; result_json: string }>();
    if (!row) return null;
    if (row.payload !== payload) throw new ClientItemError('This requestId was used for different details. Use a fresh requestId for a new item.', 409);
    return { ...JSON.parse(row.result_json), created: false };
  };
  const replay = await previous(); if (replay) return replay;
  await validate(env, input.clientId, input);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const result = { id, clientId: input.clientId, kind: input.kind, title: input.title, created: true };
  try {
    await env.TG_DATA.batch([
      env.TG_DATA.prepare('INSERT INTO mcp_item_requests(request_id,payload,result_json,created_at) VALUES(?,?,?,?)').bind(requestKey, payload, JSON.stringify(result), now),
      env.TG_DATA.prepare('INSERT INTO client_workspace_items(id,workspace_id,kind,title,body,body_format,body_json,completed,due_on,assignee,updated_at) VALUES(?,?,?,?,?,?,?,0,?,?,?)').bind(id, input.clientId, input.kind, input.title, content.body, content.format, content.json, input.dueOn || '', input.assignee || '', now),
      await clientActivity(request, env, input.clientId, `${input.kind}_created`, input.title, 'updates', actor.name),
    ]);
  } catch (error) { const concurrent = await previous(); if (concurrent) return concurrent; throw error; }
  return result;
}
export async function changeItem(env: AdminEnvironment, request: Request, input: Fields & { clientId: string; itemId: string; expectedUpdatedAt: string; completed?: boolean; remove?: boolean }, actor: ApiActor) {
  if (input.remove && actor.surface === 'mcp') throw new ClientItemError('Deletion is not available through MCP. Use the website.', 403);
  if (typeof input.expectedUpdatedAt !== 'string' || !input.expectedUpdatedAt) throw new ClientItemError('expectedUpdatedAt is required. Reload the workspace and reopen the item before saving.', 428);
  const item = await clientItem(env, input.clientId, input.itemId);
  if (item.updated_at !== input.expectedUpdatedAt) throw new ClientItemError('Item changed. Reload the workspace and reopen the item before updating.', 409);
  if (input.completed === true && item.kind !== 'todo') throw new ClientItemError('Only to-dos can be completed or reopened.');
  await validate(env, input.clientId, input, item);
  const content = noteContent(input, item.kind);
  const now = new Date(Math.max(Date.now(), (Date.parse(item.updated_at) || 0) + 1)).toISOString();
  const sets: string[] = ['updated_at=?'], values: unknown[] = [now];
  for (const [key, column] of [['title','title'],['assignee','assignee'],['dueOn','due_on']] as const) {
    if (input[key] !== undefined) { sets.push(`${column}=?`); values.push(input[key]); }
  }
  if (content) { sets.push('body=?', 'body_format=?', 'body_json=?'); values.push(content.body, content.format, content.json); }
  if (input.completed !== undefined && item.kind === 'todo') {
    sets.push('completed=?'); values.push(input.completed ? 1 : 0);
    if (!input.completed || !item.completed) { sets.push('completed_at=?'); values.push(input.completed ? now : null); }
  }
  const mutation = input.remove
    ? env.TG_DATA.prepare('DELETE FROM client_workspace_items WHERE id=? AND workspace_id=? AND updated_at=?').bind(item.id, input.clientId, input.expectedUpdatedAt)
    : env.TG_DATA.prepare(`UPDATE client_workspace_items SET ${sets.join(',')} WHERE id=? AND workspace_id=? AND updated_at=?`).bind(...values, item.id, input.clientId, input.expectedUpdatedAt);
  // D1 batch is transactional. changes() observes the immediately preceding mutation.
  const action = input.remove ? `${item.kind}_deleted` : input.completed !== undefined && item.kind === 'todo' ? input.completed ? 'todo_completed' : 'todo_reopened' : `${item.kind}_updated`;
  const auditId = crypto.randomUUID();
  await env.TG_DATA.batch([mutation, env.TG_DATA.prepare('INSERT INTO client_activity(id,client_id,occurred_at,actor,action,category,summary) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(auditId, input.clientId, now, actor.name, action, 'updates', input.title || item.title)]);
  if (!await env.TG_DATA.prepare('SELECT id FROM client_activity WHERE id=?').bind(auditId).first()) throw new ClientItemError('Item changed during this operation. Reload the workspace before retrying.', 409);
  return { id: item.id, clientId: input.clientId, ...(input.remove ? { deleted: true } : { item: await clientItem(env, input.clientId, input.itemId) }) };
}
