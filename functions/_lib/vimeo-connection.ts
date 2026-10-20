import type { AdminEnvironment } from './admin';

export type VimeoEnvironment = AdminEnvironment & {
  VIMEO_CLIENT_ID?: string;
  VIMEO_CLIENT_SECRET?: string;
  VIMEO_REDIRECT_URI?: string;
  VIMEO_TOKEN_KEY?: string;
};

export type VimeoConnection = { accessToken: string; scope?: string; connectedAt: string };
type Stored = { value: string };

function toUrlBase64(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromUrlBase64(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function key(secret: string) {
  return crypto.subtle.importKey('raw', fromUrlBase64(secret), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encrypt(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), new TextEncoder().encode(value)));
  return `v1.${toUrlBase64(iv)}.${toUrlBase64(encrypted)}`;
}

async function decrypt(value: string, secret: string) {
  const [, iv, ciphertext] = value.split('.');
  if (!iv || !ciphertext) throw new Error('The stored Vimeo connection is invalid.');
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromUrlBase64(iv) }, await key(secret), fromUrlBase64(ciphertext));
  return new TextDecoder().decode(decrypted);
}

export async function getVimeoConnection(env: VimeoEnvironment): Promise<VimeoConnection | null> {
  if (!env.VIMEO_TOKEN_KEY) return null;
  const record = await env.TG_DATA.prepare("SELECT value FROM vimeo_state WHERE key = 'connection'").first<Stored>();
  if (!record?.value) return null;
  try {
    const connection = JSON.parse(await decrypt(record.value, env.VIMEO_TOKEN_KEY)) as VimeoConnection;
    return connection.accessToken ? connection : null;
  } catch { return null; }
}

export async function saveVimeoConnection(env: VimeoEnvironment, connection: VimeoConnection) {
  if (!env.VIMEO_TOKEN_KEY) throw new Error('Vimeo token security has not been configured.');
  const value = await encrypt(JSON.stringify(connection), env.VIMEO_TOKEN_KEY);
  await env.TG_DATA.prepare("INSERT INTO vimeo_state (key, value, updated_at) VALUES ('connection', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(value, new Date().toISOString()).run();
}
