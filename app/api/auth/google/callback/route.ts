import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isTranterGreyEmail, publicOrigin, setAdminSession } from '@/lib/admin-auth';

const stateCookie = 'tg_google_oauth_state';

function sameValue(left: string | null, right: string | undefined) {
  if (!left || !right) return false;
  const supplied = Buffer.from(left);
  const expected = Buffer.from(right);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function redirectUri(request: Request) {
  return process.env.GOOGLE_REDIRECT_URI || new URL('/api/auth/google/callback', publicOrigin(request)).toString();
}

export async function GET(request: Request) {
  const origin = publicOrigin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(stateCookie)?.value;
  cookieStore.delete(stateCookie);
  if (!code || !sameValue(state, expectedState)) return NextResponse.redirect(new URL('/login?error=google', origin));

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.redirect(new URL('/login?error=google-config', origin));
  const tokens = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri(request), grant_type: 'authorization_code' }) });
  if (!tokens.ok) return NextResponse.redirect(new URL('/login?error=google', origin));
  const token = await tokens.json() as { access_token?: unknown };
  if (typeof token.access_token !== 'string') return NextResponse.redirect(new URL('/login?error=google', origin));
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!profileResponse.ok) return NextResponse.redirect(new URL('/login?error=google', origin));
  const profile = await profileResponse.json() as { email?: unknown; email_verified?: unknown; hd?: unknown };
  if (typeof profile.email !== 'string' || profile.email_verified !== true || profile.hd !== 'trantergrey.com' || !isTranterGreyEmail(profile.email)) return NextResponse.redirect(new URL('/login?error=domain', origin));

  const response = NextResponse.redirect(new URL('/admin', origin));
  setAdminSession(response, profile.email.toLowerCase());
  return response;
}
