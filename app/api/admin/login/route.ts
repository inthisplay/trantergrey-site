import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { safeAdminDestination, setAdminSession } from '@/lib/admin-auth';

export const runtime = 'nodejs';

function matchesPassword(value: string, password: string) {
  const supplied = Buffer.from(value);
  const expected = Buffer.from(password);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function publicOrigin(request: Request) {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedHost) return `${forwardedProtocol || 'https'}://${forwardedHost}`;
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const next = form.get('next');
  const supplied = form.get('password');
  const destination = safeAdminDestination(typeof next === 'string' ? next : null);
  const configuredPassword = process.env.ADMIN_PASSWORD || '';
  const suppliedPassword = typeof supplied === 'string' ? supplied : '';
  const origin = publicOrigin(request);
  if (!configuredPassword || !matchesPassword(suppliedPassword, configuredPassword)) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(destination)}&error=1`, origin), 303);
  const response = NextResponse.redirect(new URL(destination, origin), 303);
  setAdminSession(response);
  return response;
}
