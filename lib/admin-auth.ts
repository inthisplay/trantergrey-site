import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

const cookieName = 'tg_admin';
const sessionLifetime = 60 * 60 * 12;
const adminDomain = 'trantergrey.com';

function password() {
  return process.env.ADMIN_PASSWORD || '';
}

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || password();
}

function sessionValue(email: string) {
  const payload = Buffer.from(JSON.stringify({ email, expiresAt: Date.now() + sessionLifetime * 1000 })).toString('base64url');
  const signature = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function matchesSession(value: string | undefined) {
  if (!value || !sessionSecret()) return false;
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra) return false;
  const expected = Buffer.from(createHmac('sha256', sessionSecret()).update(payload).digest('base64url'));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email?: unknown; expiresAt?: unknown };
    return typeof session.email === 'string' && session.email.endsWith(`@${adminDomain}`) && typeof session.expiresAt === 'number' && session.expiresAt > Date.now();
  } catch {
    return false;
  }
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

export function setAdminSession(response: NextResponse, email = `owner@${adminDomain}`) {
  response.cookies.set(cookieName, sessionValue(email), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: sessionLifetime, path: '/' });
}

export function isTranterGreyEmail(email: string) {
  return email.toLowerCase().endsWith(`@${adminDomain}`);
}
