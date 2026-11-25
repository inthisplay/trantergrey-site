type Statement = {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};
type PrivateBucketObject = {
  body: ReadableStream;
  size: number;
  range?: { offset: number; length: number };
  httpMetadata?: { contentType?: string };
};
type PrivateBucket = {
  list?(options: {prefix: string; limit: number; cursor?: string}): Promise<{objects: {key: string; uploaded: Date}[]; truncated: boolean; cursor?: string}>;
  delete?(key: string): Promise<void>;
  get(key: string, options?: { range?: { offset: number; length?: number } }): Promise<PrivateBucketObject | null>;
  head(key: string): Promise<{ size: number; httpMetadata?: { contentType?: string } } | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
};

export type AdminEnvironment = {
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  ARCHIVE_WORKER_SECRET?: string;
  ADMIN_PASSWORD?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  GOOGLE_DRIVE_ENCRYPTION_KEY?: string;
  GOOGLE_DRIVE_ID?: string;
  MUX_TOKEN_ID?: string;
  MUX_TOKEN_SECRET?: string;
  // This is intentionally separate from the Mux API token.
  MUX_WEBHOOK_SIGNING_SECRET?: string;
  // Optional machine credential for the read-only Production Board API.
  PRODUCTION_API_TOKEN?: string;
  TG_DATA: { prepare(query: string): Statement; batch(statements: Statement[]): Promise<unknown> };
  MCP_AUTH?: AdminEnvironment['TG_DATA'];
  PRODUCTION_ARCHIVE?: PrivateBucket;
  MEDIA_OPTIMIZER?: { fetch(url: string, init?: RequestInit): Promise<Response> };
};

export type AdminSession = { name: string; email: string | null };
type AdminIdentity = { name: string; email?: string | null };

const sessionCookie = 'tg_admin';
const teamSessionLifetimeSeconds = 60 * 60 * 24 * 30;

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
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export async function adminSession(request: Request, env: AdminEnvironment): Promise<AdminSession | null> {
  const value = cookie(request, sessionCookie);
  if (!value) return null;
  const session = await env.TG_DATA
    .prepare('SELECT user_name AS name, user_email AS email FROM admin_sessions WHERE id = ? AND expires_at > ?')
    .bind(value, new Date().toISOString())
    .first<{ name: string | null; email: string | null }>();
  // Legacy password sessions have no verified identity and are no longer accepted.
  if (!session?.email) return null;
  return { name: session.name?.trim() || 'Admin', email: session.email || null };
}

export async function hasAdminSession(request: Request, env: AdminEnvironment) {
  return Boolean(await adminSession(request, env));
}

export async function adminResponse(request: Request, env: AdminEnvironment) {
  if (await hasAdminSession(request, env)) return null;
  return Response.json({ error: configured(env) ? 'Sign in to use the private library.' : 'Private access has not been configured yet.' }, { status: configured(env) ? 401 : 503 });
}

export async function adminCookie(env: AdminEnvironment, identity: AdminIdentity) {
  const value = crypto.randomUUID();
  const name = identity.name.trim().slice(0, 120) || 'Admin';
  const email = identity.email?.trim().toLowerCase().slice(0, 254) || null;
  if (!email || !isTranterGreyEmail(email)) throw new Error('A verified company identity is required.');
  const lifetime = teamSessionLifetimeSeconds;
  const expiresAt = new Date(Date.now() + lifetime * 1000).toISOString();
  const inserted = await env.TG_DATA
    .prepare('INSERT INTO admin_sessions (id, expires_at, user_name, user_email) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM team_access WHERE email=? AND active=1) RETURNING id')
    .bind(value, expiresAt, name, email, email)
    .first();
  if (!inserted) throw new Error('Team access is not active.');
  return `${sessionCookie}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${lifetime}`;
}

export function clearAdminCookie() {
  return `${sessionCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function revokeAdminSession(request: Request, env: AdminEnvironment) {
  const value = cookie(request, sessionCookie);
  if (value) await env.TG_DATA.prepare('DELETE FROM admin_sessions WHERE id = ?').bind(value).run();
}

export function safeDestination(value: FormDataEntryValue | null) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/admin';
}

export function isTranterGreyEmail(email: string) {
  return email.toLowerCase().endsWith('@trantergrey.com');
}

export function origin(request: Request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export { sameValue };
