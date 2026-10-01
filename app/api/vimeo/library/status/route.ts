import { NextResponse } from 'next/server';
import { setVimeoLibraryStatus, type VimeoLibraryVideo } from '@/lib/vimeo-library';

export const runtime = 'nodejs';

const allowedStatuses = new Set<VimeoLibraryVideo['libraryStatus']>(['unreviewed', 'published', 'hidden']);

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Curation requires the protected admin area.' }, { status: 403 });
  }
  try {
    const body = await request.json() as { id?: unknown; status?: unknown };
    if (typeof body.id !== 'string' || typeof body.status !== 'string' || !allowedStatuses.has(body.status as VimeoLibraryVideo['libraryStatus'])) {
      return NextResponse.json({ error: 'Invalid library update.' }, { status: 400 });
    }
    const video = await setVimeoLibraryStatus(body.id, body.status as VimeoLibraryVideo['libraryStatus']);
    if (!video) return NextResponse.json({ error: 'Video not found.' }, { status: 404 });
    return NextResponse.json({ id: video.id, status: video.libraryStatus });
  } catch {
    return NextResponse.json({ error: 'Could not update this video.' }, { status: 500 });
  }
}
