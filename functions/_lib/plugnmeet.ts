type PlugNmeetEnv = {
  PLUGNMEET_SERVER_URL?: string;
  PLUGNMEET_API_KEY?: string;
  PLUGNMEET_API_SECRET?: string;
  PLUGNMEET_ROOM_ID?: string;
  PLUGNMEET_ROOM_TITLE?: string;
  PLUGNMEET_GUEST_PASSWORD?: string;
  PLUGNMEET_HOST_PASSWORD?: string;
};

type PlugNmeetResponse = {
  status?: boolean;
  msg?: string;
  status_code?: string | number;
  [key: string]: unknown;
};

const encoder = new TextEncoder();

function normalizeServerUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function requiredConfig(env: PlugNmeetEnv) {
  const serverUrl = env.PLUGNMEET_SERVER_URL ? normalizeServerUrl(env.PLUGNMEET_SERVER_URL) : '';
  const apiKey = env.PLUGNMEET_API_KEY?.trim() ?? '';
  const apiSecret = env.PLUGNMEET_API_SECRET?.trim() ?? '';
  const roomId = env.PLUGNMEET_ROOM_ID?.trim() || 'ee7c6381-413c-4884-aec0-abf6b0e3ac86';

  if (!serverUrl || !apiKey || !apiSecret) {
    throw new Error('Meeting service is not configured yet.');
  }

  return { serverUrl, apiKey, apiSecret, roomId };
}

export function publicPlugNmeetConfig(env: PlugNmeetEnv) {
  const { serverUrl } = requiredConfig(env);
  return { serverUrl };
}

export async function plugNmeetRequest<T extends PlugNmeetResponse>(
  env: PlugNmeetEnv,
  path: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const { serverUrl, apiKey, apiSecret } = requiredConfig(env);
  const body = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  const response = await fetch(`${serverUrl}/auth${path}`, {
    method: 'POST',
    headers: {
      'API-KEY': apiKey,
      'HASH-SIGNATURE': signature,
      'Content-Type': 'application/json',
    },
    body,
  });

  let data: T;
  try {
    data = await response.json() as T;
  } catch {
    throw new Error('The meeting service returned an unreadable response.');
  }

  if (!response.ok || data.status === false) {
    throw new Error(typeof data.msg === 'string' && data.msg ? data.msg : 'The meeting service could not complete the request.');
  }

  return data;
}

export function plugNmeetRoom(env: PlugNmeetEnv) {
  return {
    roomId: requiredConfig(env).roomId,
    roomTitle: env.PLUGNMEET_ROOM_TITLE?.trim() || 'TG Meeting',
  };
}

async function passwordMatches(candidate: string, expected?: string) {
  if (!expected) return false;
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(candidate)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function meetingRole(env: PlugNmeetEnv, password: string) {
  if (await passwordMatches(password, env.PLUGNMEET_HOST_PASSWORD)) return { isAdmin: true };
  if (env.PLUGNMEET_GUEST_PASSWORD) {
    if (await passwordMatches(password, env.PLUGNMEET_GUEST_PASSWORD)) return { isAdmin: false };
    throw new Error('That meeting password is not correct.');
  }
  if (password) throw new Error('That meeting password is not correct.');
  return { isAdmin: false };
}

export type { PlugNmeetEnv };
