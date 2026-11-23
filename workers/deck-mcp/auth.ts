import { mcpActor } from './identity';
import { sameValue, type AdminEnvironment } from '../../functions/_lib/admin';

export type TrialEnvironment = AdminEnvironment & {
  MCP_AUTH: AdminEnvironment['TG_DATA'];
  MCP_ORIGIN: string;
  DECK_ORIGIN: string;
  TEST_ACCESS_CODE: string;
};
const scope = 'tg:personal';
const permanent = 253402300799; // Persistent grants; revoked explicitly, not on a calendar deadline.
const accessLifetime = 3600;
// Each consent page owns its cookie so a second tab/retry cannot invalidate it.
const consentCookieName = (transaction: string) => `__Host-deck-mcp-trial-${transaction.slice(0, 36)}`;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...headers, ...extra } });
const fail = (error: string, status = 400) => json({ error }, status);
const random = () => crypto.randomUUID() + crypto.randomUUID();
const now = () => Math.floor(Date.now() / 1000);
export async function digest(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function put(env: TrialEnvironment, kind: string, id: string, data: unknown, lifetime: number) {
  await env.MCP_AUTH.prepare('INSERT INTO oauth_records(kind,id,data,expires_at) VALUES(?,?,?,?)')
    .bind(kind, id, JSON.stringify(data), lifetime === permanent ? permanent : now() + lifetime).run();
}
async function get<T>(env: TrialEnvironment, kind: string, id: string): Promise<T | null> {
  const row = await env.MCP_AUTH.prepare('SELECT data FROM oauth_records WHERE kind=? AND id=? AND expires_at>?').bind(kind, id, now()).first<{ data: string }>();
  return row ? JSON.parse(row.data) : null;
}
async function consume(env: TrialEnvironment, kind: string, id: string) {
  return env.MCP_AUTH.prepare('DELETE FROM oauth_records WHERE kind=? AND id=? AND expires_at>? RETURNING data').bind(kind, id, now()).first();
}
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
function allowedRedirect(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.origin === 'https://chatgpt.com' && !url.username && !url.password && !url.search && !url.hash &&
      (url.pathname === '/connector_platform_oauth_redirect' || /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(url.pathname));
  } catch { return false; }
}
type Client = { client_id: string; redirect_uris: string[] };
type Grant = { clientId: string; redirectUri: string; challenge: string; resource: string; state: string; scope: string; invitationId?: string };
type Token = { clientId: string; resource: string; scope: string; expiresAt: number; family?: string; invitationId?: string };
type Refresh = { clientId: string; resource: string; scope: string; family: string; used: boolean; invitationId?: string };

export function authenticationEnabled(env: TrialEnvironment) {
  return Boolean(env.TEST_ACCESS_CODE?.length >= 32 && /^https:\/\//.test(env.MCP_ORIGIN));
}

export async function authorized(request: Request, env: TrialEnvironment) {
  const bearer = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9-]+)$/)?.[1];
  if (!bearer) return false;
  const token = await get<Token>(env, 'token', await digest(bearer));
  if (!token || token.resource !== `${env.MCP_ORIGIN}/mcp` || token.scope !== scope || token.expiresAt <= now()) return false;
  const session = token.family ? await get<{ invitationId?: string }>(env, 'session', token.family) : null;
  if (token.family && !session) return false;
  const invitationId = session?.invitationId || token.invitationId;
  if (invitationId) {
    const invitation = await activeInvitation(env, invitationId);
    if (!invitation) return false;
    await env.MCP_AUTH.prepare('UPDATE mcp_invitations SET last_used_at=? WHERE id=?').bind(new Date().toISOString(), invitationId).run();
    return mcpActor(invitation);
  }
  if (token.family) await env.MCP_AUTH.prepare("UPDATE oauth_records SET data=json_set(data,'$.lastUsedAt',?) WHERE kind='session' AND id=?").bind(now(), token.family).run();
  return mcpActor();
}

async function activeInvitation(env: TrialEnvironment, id: string) {
  return env.MCP_AUTH.prepare('SELECT id,email,nickname FROM mcp_invitations WHERE id=? AND redeemed_at IS NOT NULL AND revoked_at IS NULL').bind(id).first<{ id: string; email: string; nickname: string }>();
}

export function challenge(env: TrialEnvironment) {
  return json({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': `Bearer resource_metadata="${env.MCP_ORIGIN}/.well-known/oauth-protected-resource", scope="${scope}"` });
}

export async function oauth(request: Request, env: TrialEnvironment): Promise<Response | null> {
  const url = new URL(request.url);
  const resource = `${env.MCP_ORIGIN}/mcp`;
  if (url.pathname === '/.well-known/oauth-protected-resource' || url.pathname === '/.well-known/oauth-protected-resource/mcp') {
    return json({ resource, authorization_servers: [env.MCP_ORIGIN], scopes_supported: [scope] });
  }
  if (url.pathname === '/.well-known/oauth-authorization-server') {
    return json({ issuer: env.MCP_ORIGIN, authorization_endpoint: `${env.MCP_ORIGIN}/authorize`, token_endpoint: `${env.MCP_ORIGIN}/token`,
      registration_endpoint: `${env.MCP_ORIGIN}/register`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], revocation_endpoint: `${env.MCP_ORIGIN}/revoke`, revocation_endpoint_auth_methods_supported: ['none'],
      token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], scopes_supported: [scope],
      authorization_response_iss_parameter_supported: true });
  }
  if (url.pathname === '/register' && request.method === 'POST') {
    const body = await request.json().catch(() => null) as { redirect_uris?: unknown; token_endpoint_auth_method?: string } | null;
    if (!Array.isArray(body?.redirect_uris) || !body.redirect_uris.length || body.redirect_uris.length > 5 || !body.redirect_uris.every(allowedRedirect)) return fail('invalid_redirect_uri');
    if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none') return fail('invalid_client_metadata');
    const client = { client_id: crypto.randomUUID(), redirect_uris: body.redirect_uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope };
    await put(env, 'client', client.client_id, client, permanent);
    return json(client, 201);
  }
  if (url.pathname === '/authorize' && request.method === 'GET') {
    const p = url.searchParams;
    const client = await get<Client>(env, 'client', p.get('client_id') || '');
    const redirectUri = p.get('redirect_uri') || '';
    if (!client || !client.redirect_uris.includes(redirectUri)) return fail('invalid_client_or_redirect');
    if (p.get('response_type') !== 'code' || p.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(p.get('code_challenge') || '') || p.get('resource') !== resource || (p.get('scope') || scope) !== scope) return fail('invalid_request');
    const grant: Grant = { clientId: client.client_id, redirectUri, challenge: p.get('code_challenge')!, resource, state: p.get('state') || '', scope };
    if (grant.state.length > 2048) return fail('invalid_state');
    const transaction = random();
    const cookieName = consentCookieName(transaction);
    await put(env, 'pending', await digest(transaction), grant, 600);
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect TranterGrey personal MCP</title><body><main><h1>Connect TranterGrey personal MCP</h1><p>This connection can read Deck cards and history, move and create cards, add comments, read videos and public share links, link videos to cards, and read and manage Client HQ clients, notes and to-dos, including deleting items. These actions affect <strong>live TranterGrey data</strong>.</p><p>This connection stays authorized until revoked. ChatGPT can renew access automatically without asking you to sign in every hour. With a teammate invitation, actions are recorded under the name assigned to that invitation. Keep your code private; it grants access as that person.</p><form method="post" action="/authorize"><input type="hidden" name="transaction" value="${escape(transaction)}"><label>Access code <input name="access_code" type="password" required autocomplete="off"></label><p><button type="submit">Allow TranterGrey personal MCP access</button></p></form><p>Close this window to cancel. Never enter your Google or ChatGPT password here.</p></main></body></html>`;
    // Browser form POSTs need their same-site Origin; no-referrer makes it opaque (null).
    // same-origin still suppresses referrers when redirecting back to ChatGPT.
    // form-action also governs redirects in browsers: allow only the validated callback.
    return new Response(html, { headers: { ...headers, 'Referrer-Policy': 'same-origin', 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'none'; form-action 'self' ${grant.redirectUri}; frame-ancestors 'none'; base-uri 'none'`, 'Set-Cookie': `${cookieName}=${transaction}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600` } });
  }
  if (url.pathname === '/authorize' && request.method === 'POST') {
    if (request.headers.get('origin') !== env.MCP_ORIGIN) return fail('invalid_origin', 403);
    const form = await request.formData();
    const transaction = String(form.get('transaction') || '');
    if (!/^[a-f0-9-]{72}$/.test(transaction)) return fail('invalid_transaction', 403);
    const cookieName = consentCookieName(transaction);
    const cookie = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || '';
    if (!transaction || !cookie || !sameValue(transaction, cookie)) return fail('invalid_transaction', 403);
    const grant = await get<Grant>(env, 'pending', await digest(transaction));
    if (!grant || grant.scope !== scope) return fail('expired_transaction');
    const accessCode = String(form.get('access_code') || '').trim();
    const code = random(), codeHash = await digest(code), pendingHash = await digest(transaction);
    if (sameValue(accessCode, env.TEST_ACCESS_CODE)) {
      if (!await consume(env, 'pending', pendingHash)) return fail('expired_transaction');
      await put(env, 'code', codeHash, grant, 120);
    } else {
      const invitation = await env.MCP_AUTH.prepare('SELECT id FROM mcp_invitations WHERE code_hash=? AND revoked_at IS NULL AND redeemed_at IS NULL AND expires_at>?')
        .bind(await digest(accessCode.toUpperCase()), now()).first<{ id: string }>();
      if (!invitation) return fail('invalid_or_used_invitation', 403);
      grant.invitationId = invitation.id;
      const issuedAt = now();
      await env.MCP_AUTH.batch([
        env.MCP_AUTH.prepare("INSERT INTO oauth_records(kind,id,data,expires_at) SELECT 'code',?,?,? FROM mcp_invitations WHERE id=? AND revoked_at IS NULL AND redeemed_at IS NULL AND expires_at>? AND EXISTS (SELECT 1 FROM oauth_records WHERE kind='pending' AND id=? AND expires_at>?)")
          .bind(codeHash, JSON.stringify(grant), issuedAt + 120, invitation.id, issuedAt, pendingHash, issuedAt),
        env.MCP_AUTH.prepare("UPDATE mcp_invitations SET redeemed_at=? WHERE id=? AND EXISTS (SELECT 1 FROM oauth_records WHERE kind='code' AND id=?)")
          .bind(new Date().toISOString(), invitation.id, codeHash),
        env.MCP_AUTH.prepare("DELETE FROM oauth_records WHERE kind='pending' AND id=? AND EXISTS (SELECT 1 FROM oauth_records WHERE kind='code' AND id=?)")
          .bind(pendingHash, codeHash),
      ]);
      if (!await get(env, 'code', codeHash)) return fail('invalid_or_used_invitation', 403);
    }
    const target = new URL(grant.redirectUri);
    target.searchParams.set('code', code); target.searchParams.set('iss', env.MCP_ORIGIN);
    if (grant.state) target.searchParams.set('state', grant.state);
    return new Response(null, { status: 303, headers: { ...headers, Location: target.href, 'Set-Cookie': `${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0` } });
  }
  if (url.pathname === '/revoke' && request.method === 'POST') {
    const form = await request.formData();
    const hash = await digest(String(form.get('token') || ''));
    const record = await get<Refresh>(env, 'refresh', hash) || await get<Token>(env, 'token', hash);
    if (record && record.clientId === form.get('client_id')) {
      if (record.family) await env.MCP_AUTH.prepare("DELETE FROM oauth_records WHERE kind='session' AND id=?").bind(record.family).run();
      else await env.MCP_AUTH.prepare("DELETE FROM oauth_records WHERE kind='token' AND id=?").bind(hash).run();
    }
    return json({}); // RFC 7009: unknown tokens also succeed without revealing state.
  }
  if (url.pathname === '/token' && request.method === 'POST') {
    const form = await request.formData();
    if (form.get('grant_type') === 'refresh_token') {
      const oldHash = await digest(String(form.get('refresh_token') || ''));
      const old = await get<Refresh>(env, 'refresh', oldHash);
      if (!old || old.scope !== scope || old.clientId !== form.get('client_id') || old.resource !== resource ||
        (form.has('resource') && form.get('resource') !== old.resource) || (form.has('scope') && form.get('scope') !== old.scope)) return fail('invalid_grant');
      if ((old.invitationId && !await activeInvitation(env, old.invitationId)) || !await get(env, 'session', old.family)) return fail('invalid_grant');
      if (old.used) {
        await env.MCP_AUTH.prepare("DELETE FROM oauth_records WHERE kind='session' AND id=?").bind(old.family).run();
        return fail('invalid_grant');
      }
      const accessToken = random(), refreshToken = random();
      const accessHash = await digest(accessToken), refreshHash = await digest(refreshToken);
      const expiresAt = now() + accessLifetime;
      // One atomic batch claims the old token and issues exactly one replacement.
      // Concurrent refreshes cannot both succeed; reuse revokes this family.
      const condition = "kind='refresh' AND id=? AND json_extract(data,'$.used')=0 AND EXISTS (SELECT 1 FROM oauth_records WHERE kind='session' AND id=?)";
      await env.MCP_AUTH.batch([
        env.MCP_AUTH.prepare(`INSERT INTO oauth_records(kind,id,data,expires_at) SELECT 'refresh',?,?,? FROM oauth_records WHERE ${condition}`)
          .bind(refreshHash, JSON.stringify({ ...old, used: false }), permanent, oldHash, old.family),
        env.MCP_AUTH.prepare(`INSERT INTO oauth_records(kind,id,data,expires_at) SELECT 'token',?,?,? FROM oauth_records WHERE ${condition}`)
          .bind(accessHash, JSON.stringify({ clientId: old.clientId, resource, scope, family: old.family, invitationId: old.invitationId, expiresAt }), expiresAt, oldHash, old.family),
        env.MCP_AUTH.prepare(`UPDATE oauth_records SET data=json_set(data,'$.used',json('true')) WHERE ${condition}`).bind(oldHash, old.family),
      ]);
      if (!await get(env, 'refresh', refreshHash)) {
        await env.MCP_AUTH.prepare("DELETE FROM oauth_records WHERE kind='session' AND id=?").bind(old.family).run();
        return fail('invalid_grant');
      }
      return json({ access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer', expires_in: accessLifetime, scope });
    }
    if (form.get('grant_type') !== 'authorization_code') return fail('unsupported_grant_type');
    const codeHash = await digest(String(form.get('code') || ''));
    const grant = await get<Grant>(env, 'code', codeHash);
    const verifier = String(form.get('code_verifier') || '');
    if (!grant || grant.scope !== scope || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || grant.clientId !== form.get('client_id') || grant.redirectUri !== form.get('redirect_uri') || grant.resource !== form.get('resource') || !sameValue(await digest(verifier), grant.challenge)) return fail('invalid_grant');
    const accessToken = random(), refreshToken = random(), family = crypto.randomUUID();
    const issuedAt = now();
    const expiresAt = issuedAt + accessLifetime;
    if (grant.invitationId && !await activeInvitation(env, grant.invitationId)) return fail('invalid_grant');
    const record = { clientId: grant.clientId, resource, scope, family, invitationId: grant.invitationId };
    const condition = "kind='code' AND id=? AND expires_at>? AND (json_extract(data,'$.invitationId') IS NULL OR EXISTS (SELECT 1 FROM mcp_invitations i WHERE i.id=json_extract(oauth_records.data,'$.invitationId') AND i.revoked_at IS NULL AND i.redeemed_at IS NOT NULL))";
    await env.MCP_AUTH.batch([
      env.MCP_AUTH.prepare(`INSERT INTO oauth_records(kind,id,data,expires_at) SELECT 'session',?,?,? FROM oauth_records WHERE ${condition}`)
        .bind(family, JSON.stringify({ ...record, createdAt: issuedAt }), permanent, codeHash, issuedAt),
      env.MCP_AUTH.prepare(`INSERT INTO oauth_records(kind,id,data,expires_at) SELECT 'refresh',?,?,? FROM oauth_records WHERE ${condition}`)
        .bind(await digest(refreshToken), JSON.stringify({ ...record, used: false }), permanent, codeHash, issuedAt),
      env.MCP_AUTH.prepare(`INSERT INTO oauth_records(kind,id,data,expires_at) SELECT 'token',?,?,? FROM oauth_records WHERE ${condition}`)
        .bind(await digest(accessToken), JSON.stringify({ ...record, expiresAt }), expiresAt, codeHash, issuedAt),
      env.MCP_AUTH.prepare("UPDATE oauth_records SET expires_at=? WHERE kind='client' AND id=? AND EXISTS (SELECT 1 FROM oauth_records WHERE kind='session' AND id=?)")
        .bind(permanent, grant.clientId, family),
      env.MCP_AUTH.prepare("DELETE FROM oauth_records WHERE kind='code' AND id=?").bind(codeHash),
    ]);
    if (!await get(env, 'session', family)) return fail('invalid_grant');
    return json({ access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer', expires_in: accessLifetime, scope });
  }
  return null;
}
