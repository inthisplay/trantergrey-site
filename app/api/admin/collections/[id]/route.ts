import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { updateWorkCollection } from '@/lib/work-collections';

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const body = await request.json() as { videoIds?: unknown };
    if (!Array.isArray(body.videoIds)) return NextResponse.json({ error: 'Invalid video selection.' }, { status: 400 });
    const { id } = await params;
    const collection = await updateWorkCollection(id, { videoIds: body.videoIds });
    return collection ? NextResponse.json({ videoIds: collection.videoIds }) : NextResponse.json({ error: 'Collection not found.' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Could not save the collection.' }, { status: 500 });
  }
}
