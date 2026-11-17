import { adminSession, type AdminEnvironment } from '../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };
type TeamMemberRow = { email: string; nickname: string; createdAt: string; updatedAt: string };
const accessOwnerEmail = 'tyler@trantergrey.com';

async function teamAdminResponse(request: Request, env: AdminEnvironment) {
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
  const members = await env.TG_DATA.prepare('SELECT email, nickname, created_at AS createdAt, updated_at AS updatedAt FROM admin_team_directory ORDER BY nickname COLLATE NOCASE, email COLLATE NOCASE').all<TeamMemberRow>();
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
  return Response.json({ member: { email, nickname, createdAt: now, updatedAt: now } });
}
