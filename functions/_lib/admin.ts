type Statement = {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
};

export type AdminEnvironment = {
  ADMIN_PASSWORD?: string;
  TG_DATA: { prepare(query: string): Statement };
};

const sessionCookie = 'tg_admin';
const sessionMessage = 'trantergrey-admin-session-v1';

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

function base64Url(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}

export function configured(env: AdminEnvironment) {
  return Boolean(env.ADMIN_PASSWORD);
}

export async function hasAdminSession(request: Request, env: AdminEnvironment) {
  if (!env.ADMIN_PASSWORD) return false;
  const actual = cookie(request, sessionCookie);
  const expected = await sign(sessionMessage, env.ADMIN_PASSWORD);
  return Boolean(actual && sameValue(actual, expected));
}

export async function adminResponse(request: Request, env: AdminEnvironment) {
  if (await hasAdminSession(request, env)) return null;
  return Response.json({ error: configured(env) ? 'Sign in to use the private library.' : 'Private access has not been configured yet.' }, { status: configured(env) ? 401 : 503 });
}

export async function adminCookie(env: AdminEnvironment) {
  if (!env.ADMIN_PASSWORD) return '';
  const value = await sign(sessionMessage, env.ADMIN_PASSWORD);
  return `${sessionCookie}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`;
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
