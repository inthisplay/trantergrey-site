import { isAdmin } from '@/lib/admin-auth';

export async function GET() {
  const authenticated = await isAdmin();
  return Response.json({ authenticated }, { status: authenticated ? 200 : 401, headers: { 'Cache-Control': 'private, no-store' } });
}
