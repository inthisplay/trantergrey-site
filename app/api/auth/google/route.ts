import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { publicOrigin } from '@/lib/admin-auth';

const stateCookie = 'tg_google_oauth_state';
const stateLifetime = 60 * 10;

function redirectUri(request: Request) {
  return process.env.GOOGLE_REDIRECT_URI || new URL('/api/auth/google/callback', publicOrigin(request)).toString();
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) return NextResponse.redirect(new URL('/login?error=google-config', publicOrigin(request)));
  const state = randomUUID();
  const authorizeUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri(request));
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'openid email profile');
  authorizeUrl.searchParams.set('hd', 'trantergrey.com');
  authorizeUrl.searchParams.set('state', state);
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(stateCookie, state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: stateLifetime, path: '/' });
  return response;
}
