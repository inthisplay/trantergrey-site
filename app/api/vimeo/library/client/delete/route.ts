import { NextResponse } from 'next/server';
import { deleteVimeoLibraryClient } from '@/lib/vimeo-library';
import { requireAdminApi } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const body = await request.json() as { client?: unknown };
    if (typeof body.client !== 'string' || !body.client.trim()) return NextResponse.json({ error: 'Invalid client.' }, { status: 400 });
    const result = await deleteVimeoLibraryClient(body.client.trim());
    return result ? NextResponse.json(result) : NextResponse.json({ error: 'Library not found.' }, { status: 404 });
  } catch { return NextResponse.json({ error: 'Could not delete this client.' }, { status: 500 }); }
}
