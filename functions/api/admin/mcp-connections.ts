import type { AdminEnvironment } from '../../_lib/admin';
import { requireAccessOwner } from '../../_lib/access-owner';
type Environment = AdminEnvironment & { MCP_AUTH?: AdminEnvironment['TG_DATA'] };
type Context = { request: Request; env: Environment };
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
async function hash(value: string) {
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function onRequest({ request, env }: Context) {
  const denied = await requireAccessOwner(request, env); if (denied) return denied;
  const db = env.MCP_AUTH;
  if (!db) return reply({ error: 'AI connection storage is not configured.' }, 503);
  try {
    if (request.method === 'GET') {
      const [members, invitations, connections] = await Promise.all([
        env.TG_DATA.prepare('SELECT email,nickname FROM admin_team_directory ORDER BY nickname COLLATE NOCASE').all(),
        db.prepare(`SELECT i.id,i.email,i.nickname,i.created_at AS createdAt,i.expires_at AS expiresAt,i.redeemed_at AS redeemedAt,i.revoked_at AS revokedAt,i.last_used_at AS lastUsedAt,
          (SELECT COUNT(*) FROM oauth_records s WHERE s.kind='session' AND json_extract(s.data,'$.invitationId')=i.id) AS connectionCount
          FROM mcp_invitations i ORDER BY i.created_at DESC LIMIT 200`).all(),
        db.prepare(`SELECT id,json_extract(data,'$.createdAt') AS createdAt,json_extract(data,'$.lastUsedAt') AS lastUsedAt
          FROM oauth_records WHERE kind='session' AND json_extract(data,'$.invitationId') IS NULL ORDER BY json_extract(data,'$.createdAt') DESC LIMIT 100`).all(),
      ]);
      return reply({ members: members.results, invitations: invitations.results, ownerConnections: connections.results });
    }
    if (request.method !== 'POST') return reply({ error: 'Use GET or POST.' }, 405);
    if (Number(request.headers.get('content-length')) > 4096) return reply({ error: 'Request too large.' }, 413);
    const raw = await request.text(); if (raw.length > 4096) return reply({ error: 'Request too large.' }, 413);
    const body = JSON.parse(raw) as { action?: string; email?: string; id?: string; requestId?: string };
    if (!body || typeof body !== 'object') return reply({ error: 'Invalid request.' }, 400);
    if (body.action === 'invite') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const member = await env.TG_DATA.prepare('SELECT email,nickname FROM admin_team_directory WHERE email=?').bind(email).first<{ email: string; nickname: string }>();
      if (!member) return reply({ error: 'Choose someone from the team directory.' }, 400);
      if (typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.requestId)) return reply({ error: 'A request ID is required.' }, 400);
      if (await db.prepare('SELECT id FROM mcp_invitations WHERE id=?').bind(body.requestId).first()) return reply({ error: 'This code was already generated and cannot be retrieved. Refresh the list to revoke it or create a new invitation.' }, 409);
      // 128 bits, human-copyable; only its digest is persisted. Returned once.
      const code = 'TG-' + crypto.randomUUID().replaceAll('-', '').toUpperCase();
      const id = body.requestId, createdAt = new Date().toISOString(), expiresAt = Math.floor(Date.now() / 1000) + 7 * 86400;
      await db.prepare('INSERT INTO mcp_invitations(id,email,nickname,code_hash,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(id, member.email, member.nickname, await hash(code), createdAt, expiresAt).run();
      return reply({ invitation: { id, ...member, createdAt, expiresAt }, code }, 201);
    }
    if (typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/.test(body.id)) return reply({ error: 'Choose a valid invitation or connection.' }, 400);
    if (body.action === 'revoke-invitation') {
      const row = await db.prepare('SELECT id FROM mcp_invitations WHERE id=?').bind(body.id).first();
      if (!row) return reply({ error: 'Invitation not found.' }, 404);
      await db.batch([
        db.prepare('UPDATE mcp_invitations SET revoked_at=COALESCE(revoked_at,?) WHERE id=?').bind(new Date().toISOString(), body.id),
        db.prepare("DELETE FROM oauth_records WHERE kind IN ('session','code') AND json_extract(data,'$.invitationId')=?").bind(body.id),
      ]);
      return reply({ revoked: true });
    }
    if (body.action === 'revoke-owner-connection') {
      await db.prepare("DELETE FROM oauth_records WHERE kind='session' AND id=? AND json_extract(data,'$.invitationId') IS NULL").bind(body.id).run();
      return reply({ revoked: true });
    }
    return reply({ error: 'Unknown action.' }, 400);
  } catch { return reply({ error: 'Unable to manage AI access. Refresh the page before retrying.' }, 503); }
}
