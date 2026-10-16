import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { publicOrigin, safeAdminDestination, setAdminSession } from '@/lib/admin-auth';

export const runtime = 'nodejs';

function matchesPassword(value: string, password: string) {
  const supplied = Buffer.from(value);
  const expected = Buffer.from(password);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
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
