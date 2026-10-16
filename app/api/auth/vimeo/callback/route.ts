import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { saveVimeoConnection } from '@/lib/vimeo-connection';
import { requireAdminApi } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('vimeo_oauth_state')?.value;
  cookieStore.delete('vimeo_oauth_state');
  if (!code || !state || state !== expectedState) return NextResponse.json({ error: 'Vimeo authorization could not be verified.' }, { status: 400 });
  const clientId = process.env.VIMEO_CLIENT_ID;
  const clientSecret = process.env.VIMEO_CLIENT_SECRET;
  const redirectUri = process.env.VIMEO_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return NextResponse.json({ error: 'Vimeo OAuth is not configured.' }, { status: 500 });
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://api.vimeo.com/oauth/access_token', { method: 'POST', headers: { Authorization: `basic ${credentials}`, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }) });
  if (!response.ok) return NextResponse.json({ error: 'Vimeo rejected the authorization request.' }, { status: 502 });
  const token = await response.json() as { access_token?: string; scope?: string };
  if (!token.access_token) return NextResponse.json({ error: 'Vimeo did not return an access token.' }, { status: 502 });
  await saveVimeoConnection({ accessToken: token.access_token, scope: token.scope, connectedAt: new Date().toISOString() });
  return NextResponse.redirect(new URL('/connect-vimeo?connected=1', request.url));
}
