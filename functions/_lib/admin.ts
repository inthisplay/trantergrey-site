type Statement = {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};

export type AdminEnvironment = {
  ADMIN_PASSWORD?: string;
  TG_DATA: { prepare(query: string): Statement };
};

const sessionCookie = 'tg_admin';
const sessionLifetimeSeconds = 60 * 60 * 12;

function cookie(request: Request, name: string) {
  const value = request.headers.get('cookie') || '';
  return value.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function sameValue(first: string, second: string) {
  const firstBytes = new TextEncoder().encode(first);
  const secondBytes = new TextEncoder().encode(second);
  let different = firstBytes.length ^ secondBytes.length;
  const length = Math.max(firstBytes.length, secondBytes.length);
  for (let index = 0; index < length; index += 1) different |= (firstBytes[index] || 0) ^ (secondBytes[index] || 0);
  return different === 0;
}

export function configured(env: AdminEnvironment) {
  return Boolean(env.ADMIN_PASSWORD);
}

export async function hasAdminSession(request: Request, env: AdminEnvironment) {
  if (!env.ADMIN_PASSWORD) return false;
  const value = cookie(request, sessionCookie);
  if (!value) return false;
  const session = await env.TG_DATA
    .prepare('SELECT id FROM admin_sessions WHERE id = ? AND expires_at > ?')
    .bind(value, new Date().toISOString())
    .first<{ id: string }>();
  return Boolean(session);
}

export async function adminResponse(request: Request, env: AdminEnvironment) {
  if (await hasAdminSession(request, env)) return null;
  return Response.json({ error: configured(env) ? 'Sign in to use the private library.' : 'Private access has not been configured yet.' }, { status: configured(env) ? 401 : 503 });
}

export async function adminCookie(env: AdminEnvironment) {
  if (!env.ADMIN_PASSWORD) return '';
  const value = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000).toISOString();
  await env.TG_DATA
    .prepare('INSERT INTO admin_sessions (id, expires_at) VALUES (?, ?)')
    .bind(value, expiresAt)
    .run();
  return `${sessionCookie}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionLifetimeSeconds}`;
}

export function clearAdminCookie() {
  return `${sessionCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function safeDestination(value: FormDataEntryValue | null) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/admin';
}

export function origin(request: Request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export { sameValue };
