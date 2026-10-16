import { NextResponse } from 'next/server';
import { setVimeoLibraryLocalTags } from '@/lib/vimeo-library';
import { requireAdminApi } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const body = await request.json() as { id?: unknown; tags?: unknown };
    if (typeof body.id !== 'string' || !Array.isArray(body.tags) || body.tags.some((tag) => typeof tag !== 'string')) {
      return NextResponse.json({ error: 'Invalid tag update.' }, { status: 400 });
    }
    if (body.tags.length > 24 || body.tags.some((tag) => tag.trim().length > 48)) {
      return NextResponse.json({ error: 'Use up to 24 tags, each under 48 characters.' }, { status: 400 });
    }
    const video = await setVimeoLibraryLocalTags(body.id, body.tags);
    return video ? NextResponse.json({ id: video.id, localTags: video.localTags ?? [] }) : NextResponse.json({ error: 'Video not found.' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Could not save these tags.' }, { status: 500 });
  }
}
