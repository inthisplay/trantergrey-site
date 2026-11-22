import type { ApiActor } from '../../functions/_lib/internal-api';
import type { TrialEnvironment } from './auth';
import { clientActivity } from '../../functions/_lib/client-activity';

export class ToolError extends Error {}
type Item = { id: string; workspace_id: string; kind: string; title: string; body: string; body_format: string; body_json: string | null; completed: number; assignee: string; due_on: string; updated_at: string };
type Fields = { title?: string; body?: string; assignee?: string; dueOn?: string };
export async function clientItem(env: TrialEnvironment, clientId: string, itemId: string) {
  const item = await env.TG_DATA.prepare('SELECT * FROM client_workspace_items WHERE workspace_id=? AND id=?').bind(clientId, itemId).first<Item>();
  if (!item) throw new ToolError('Item not found in this client workspace.');
  return item;
}
async function validate(env: TrialEnvironment, clientId: string, fields: Fields) {
  if (!await env.TG_DATA.prepare('SELECT id FROM client_directory WHERE id=?').bind(clientId).first()) throw new ToolError('Client not found.');
  if (fields.assignee) {
    const team = await env.TG_DATA.prepare('SELECT nickname FROM admin_team_directory').all<{ nickname: string }>();
    if (fields.assignee.split(',').some(name => !team.results.some(member => member.nickname === name.trim()))) throw new ToolError('Choose exact assignee names returned by get_client_workspace.');
  }
  if (fields.dueOn && (Number.isNaN(Date.parse(fields.dueOn)) || new Date(fields.dueOn).toISOString().slice(0, 10) !== fields.dueOn)) throw new ToolError('Use a valid calendar date YYYY-MM-DD.');
}
export async function createItem(env: TrialEnvironment, request: Request, input: Fields & { clientId: string; kind: 'todo' | 'note'; title: string; requestId: string }, actor: ApiActor) {
  const requestKey = actor.id === 'chatgpt-personal-mcp' ? input.requestId : `${actor.id}:${input.requestId}`;
  const payload = JSON.stringify({ clientId: input.clientId, kind: input.kind, title: input.title, body: input.body || '', assignee: input.assignee || '', dueOn: input.dueOn || '' });
  const previous = async () => {
    const row = await env.TG_DATA.prepare('SELECT payload,result_json FROM mcp_item_requests WHERE request_id=?').bind(requestKey).first<{ payload: string; result_json: string }>();
    if (!row) return null;
    if (row.payload !== payload) throw new ToolError('This requestId was used for different details. Use a fresh requestId for a new item.');
    return { ...JSON.parse(row.result_json), created: false };
  };
  const replay = await previous(); if (replay) return replay;
  await validate(env, input.clientId, input);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const result = { id, clientId: input.clientId, kind: input.kind, title: input.title, created: true };
  try {
    await env.TG_DATA.batch([
      env.TG_DATA.prepare('INSERT INTO mcp_item_requests(request_id,payload,result_json,created_at) VALUES(?,?,?,?)').bind(requestKey, payload, JSON.stringify(result), now),
      env.TG_DATA.prepare('INSERT INTO client_workspace_items(id,workspace_id,kind,title,body,body_format,body_json,completed,due_on,assignee,updated_at) VALUES(?,?,?,?,?,?,NULL,0,?,?,?)').bind(id, input.clientId, input.kind, input.title, input.body || '', 'text', input.dueOn || '', input.assignee || '', now),
      await clientActivity(request, env, input.clientId, `${input.kind}_created`, input.title, 'updates', actor.name),
    ]);
  } catch (error) { const concurrent = await previous(); if (concurrent) return concurrent; throw error; }
  return result;
}
export async function changeItem(env: TrialEnvironment, request: Request, input: Fields & { clientId: string; itemId: string; expectedUpdatedAt: string; completed?: boolean; remove?: boolean }, actor: ApiActor) {
  const item = await clientItem(env, input.clientId, input.itemId);
  if (item.updated_at !== input.expectedUpdatedAt) throw new ToolError('Item changed. Read the client workspace again before updating.');
  if (input.completed !== undefined && item.kind !== 'todo') throw new ToolError('Only to-dos can be completed or reopened.');
  await validate(env, input.clientId, input);
  const now = new Date(Math.max(Date.now(), (Date.parse(item.updated_at) || 0) + 1)).toISOString();
  const sets: string[] = ['updated_at=?'], values: unknown[] = [now];
  for (const [key, column] of [['title','title'],['body','body'],['assignee','assignee'],['dueOn','due_on']] as const) {
    if (input[key] !== undefined) { sets.push(`${column}=?`); values.push(input[key]); }
  }
  if (input.body !== undefined) { sets.push("body_format='text'", 'body_json=NULL'); }
  if (input.completed !== undefined) {
    sets.push('completed=?'); values.push(input.completed ? 1 : 0);
    if (!input.completed || !item.completed) { sets.push('completed_at=?'); values.push(input.completed ? now : null); }
  }
  const mutation = input.remove
    ? env.TG_DATA.prepare('DELETE FROM client_workspace_items WHERE id=? AND workspace_id=? AND updated_at=?').bind(item.id, input.clientId, input.expectedUpdatedAt)
    : env.TG_DATA.prepare(`UPDATE client_workspace_items SET ${sets.join(',')} WHERE id=? AND workspace_id=? AND updated_at=?`).bind(...values, item.id, input.clientId, input.expectedUpdatedAt);
  // D1 batch is transactional. changes() observes the immediately preceding mutation.
  const action = input.remove ? `${item.kind}_deleted` : input.completed !== undefined ? input.completed ? 'todo_completed' : 'todo_reopened' : `${item.kind}_updated`;
  const auditId = crypto.randomUUID();
  await env.TG_DATA.batch([mutation, env.TG_DATA.prepare('INSERT INTO client_activity(id,client_id,occurred_at,actor,action,category,summary) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(auditId, input.clientId, now, actor.name, action, 'updates', input.title || item.title)]);
  if (!await env.TG_DATA.prepare('SELECT id FROM client_activity WHERE id=?').bind(auditId).first()) throw new ToolError('Item changed during this operation. Read the workspace before retrying.');
  return { id: item.id, clientId: input.clientId, ...(input.remove ? { deleted: true } : { item: await clientItem(env, input.clientId, input.itemId) }) };
}
