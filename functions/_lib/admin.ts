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
  get(key: string, options?: { range?: { offset: number; length?: number } }): Promise<PrivateBucketObject | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
};

export type AdminEnvironment = {
  ADMIN_PASSWORD?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  MUX_TOKEN_ID?: string;
  MUX_TOKEN_SECRET?: string;
  // Optional machine credential for the read-only Production Board API.
  PRODUCTION_API_TOKEN?: string;
  TG_DATA: { prepare(query: string): Statement; batch(statements: Statement[]): Promise<unknown> };
  PRODUCTION_ARCHIVE?: PrivateBucket;
};

export type AdminSession = { name: string; email: string | null };
type AdminIdentity = { name: string; email?: string | null };

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
  return passwordConfigured(env) || Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function passwordConfigured(env: AdminEnvironment) {
  return Boolean(env.ADMIN_PASSWORD);
}

export async function adminSession(request: Request, env: AdminEnvironment): Promise<AdminSession | null> {
  const value = cookie(request, sessionCookie);
  if (!value) return null;
  const session = await env.TG_DATA
    .prepare('SELECT user_name AS name, user_email AS email FROM admin_sessions WHERE id = ? AND expires_at > ?')
    .bind(value, new Date().toISOString())
    .first<{ name: string | null; email: string | null }>();
  if (!session) return null;
  return { name: session.name?.trim() || 'Admin', email: session.email || null };
}

export async function hasAdminSession(request: Request, env: AdminEnvironment) {
  return Boolean(await adminSession(request, env));
}

export async function adminResponse(request: Request, env: AdminEnvironment) {
  if (await hasAdminSession(request, env)) return null;
  return Response.json({ error: configured(env) ? 'Sign in to use the private library.' : 'Private access has not been configured yet.' }, { status: configured(env) ? 401 : 503 });
}

export async function adminCookie(env: AdminEnvironment, identity: AdminIdentity = { name: 'Admin' }) {
  const value = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000).toISOString();
  const name = identity.name.trim().slice(0, 120) || 'Admin';
  const email = identity.email?.trim().toLowerCase().slice(0, 254) || null;
  await env.TG_DATA
    .prepare('INSERT INTO admin_sessions (id, expires_at, user_name, user_email) VALUES (?, ?, ?, ?)')
    .bind(value, expiresAt, name, email)
    .run();
  return `${sessionCookie}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionLifetimeSeconds}`;
}

export function clearAdminCookie() {
  return `${sessionCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
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
