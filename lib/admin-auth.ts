import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

const cookieName = 'tg_admin';
const sessionLifetime = 60 * 60 * 12;

function password() {
  return process.env.ADMIN_PASSWORD || '';
}

function sessionValue() {
  return createHmac('sha256', password()).update('trantergrey-admin-session-v1').digest('base64url');
}

function matchesSession(value: string | undefined) {
  if (!value || !password()) return false;
  const expected = Buffer.from(sessionValue());
  const actual = Buffer.from(value);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function safeAdminDestination(value: string | null | undefined) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/admin';
}

export function publicOrigin(request: Request) {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedHost) return `${forwardedProtocol || 'https'}://${forwardedHost}`;
  return new URL(request.url).origin;
}

export async function isAdmin() {
  return matchesSession((await cookies()).get(cookieName)?.value);
}

export async function requireAdminPage(destination: string) {
  if (!await isAdmin()) redirect(`/login?next=${encodeURIComponent(safeAdminDestination(destination))}`);
}

export async function requireAdminApi() {
  if (await isAdmin()) return null;
  return NextResponse.json({ error: password() ? 'Sign in to use the private library.' : 'ADMIN_PASSWORD is not configured.' }, { status: 401 });
}

export function setAdminSession(response: NextResponse) {
  response.cookies.set(cookieName, sessionValue(), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: sessionLifetime, path: '/' });
}
