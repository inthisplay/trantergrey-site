import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const clientId = process.env.VIMEO_CLIENT_ID;
  const redirectUri = process.env.VIMEO_REDIRECT_URI;
  if (!clientId || !redirectUri) return NextResponse.json({ error: 'Vimeo OAuth is not configured.' }, { status: 500 });
  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('vimeo_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 600, path: '/' });
  const authorizeUrl = new URL('https://api.vimeo.com/oauth/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('scope', 'public private');
  return NextResponse.redirect(authorizeUrl);
}
