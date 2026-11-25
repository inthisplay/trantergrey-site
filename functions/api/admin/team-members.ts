import { adminSession, type AdminEnvironment } from '../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };
type TeamMemberRow = { active: number; email: string; nickname: string; createdAt: string; updatedAt: string };
const accessOwnerEmail = 'tyler@trantergrey.com';

async function teamAdminResponse(request: Request, env: AdminEnvironment) {
  const origin = request.headers.get('origin');
  if (request.method !== 'GET' && origin && origin !== new URL(request.url).origin) return { denied: Response.json({ error: 'Invalid request origin.' }, { status: 403 }), allowed: false };
  const session = await adminSession(request, env);
  if (!session) return { denied: Response.json({ error: 'Sign in to manage team names.' }, { status: 401 }), allowed: false };
  if (session.email?.trim().toLowerCase() !== accessOwnerEmail) return { denied: Response.json({ error: 'This page is restricted to its owner.' }, { status: 403 }), allowed: false };
  return { denied: null, allowed: true };
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@trantergrey\.com$/.test(email) ? email : '';
}

function normalizeNickname(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const access = await teamAdminResponse(request, env); if (access.denied) return access.denied;
  if (new URL(request.url).searchParams.get('permission-check') === '1') return Response.json({ allowed: access.allowed }, { headers: { 'Cache-Control': 'private, no-store' } });
  const members = await env.TG_DATA.prepare('SELECT d.email, d.nickname, d.created_at AS createdAt, d.updated_at AS updatedAt, COALESCE(a.active,0) AS active FROM admin_team_directory d LEFT JOIN team_access a ON a.email=d.email ORDER BY nickname COLLATE NOCASE, d.email COLLATE NOCASE').all<TeamMemberRow>();
  return Response.json({ members: members.results }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const access = await teamAdminResponse(request, env); if (access.denied) return access.denied;
  const body = await request.json().catch(() => null) as { email?: unknown; nickname?: unknown } | null;
  const email = normalizeEmail(body?.email);
  const nickname = normalizeNickname(body?.nickname);
  if (!email || !nickname) return Response.json({ error: 'Enter a TranterGrey email and a nickname up to 80 characters.' }, { status: 400 });
  const now = new Date().toISOString();
  await env.TG_DATA.prepare(`INSERT INTO admin_team_directory (email, nickname, created_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET nickname = excluded.nickname, updated_at = excluded.updated_at`).bind(email, nickname, now, now).run();
  await env.TG_DATA.prepare('INSERT INTO team_access(email,active,updated_at) VALUES(?,1,?) ON CONFLICT(email) DO NOTHING').bind(email,now).run();
  const accessState=await env.TG_DATA.prepare('SELECT active FROM team_access WHERE email=?').bind(email).first<{active:number}>();
  return Response.json({ member: { email, nickname, active: accessState?.active || 0, createdAt: now, updatedAt: now } });
}

export async function onRequestPatch({ request, env }: Context): Promise<Response> {
  const access=await teamAdminResponse(request,env);if(access.denied)return access.denied;
  const body=await request.json().catch(()=>null), email=normalizeEmail(body?.email);
  if(!email || typeof body?.active!=='boolean')return Response.json({error:'Choose a teammate and access state.'},{status:400});
  if(email===accessOwnerEmail && !body.active)return Response.json({error:'The owner cannot disable their own access.'},{status:400});
  if(!await env.TG_DATA.prepare('SELECT email FROM admin_team_directory WHERE email=?').bind(email).first())return Response.json({error:'Teammate not found.'},{status:404});
  const now=new Date().toISOString();
  if(!body.active) {
    if(!env.MCP_AUTH)return Response.json({error:'Connection storage is unavailable. Access was not changed.'},{status:503});
    await env.MCP_AUTH.batch([
      env.MCP_AUTH.prepare('UPDATE mcp_invitations SET revoked_at=COALESCE(revoked_at,?) WHERE lower(email)=?').bind(now,email),
      env.MCP_AUTH.prepare("DELETE FROM oauth_records WHERE kind IN ('session','code') AND json_extract(data,'$.invitationId') IN (SELECT id FROM mcp_invitations WHERE lower(email)=?)").bind(email),
    ]);
  }
  await env.TG_DATA.batch([
    env.TG_DATA.prepare('INSERT INTO team_access(email,active,updated_at) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET active=excluded.active,updated_at=excluded.updated_at').bind(email,body.active?1:0,now),
    ...(!body.active?[env.TG_DATA.prepare('DELETE FROM admin_sessions WHERE lower(user_email)=?').bind(email)]:[]),
  ]);
  return Response.json({ok:true});
}
