import { NextResponse } from 'next/server';
import { setVimeoLibraryCustomTitle } from '@/lib/vimeo-library';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Curation requires the protected admin area.' }, { status: 403 });
  try {
    const body = await request.json() as { id?: unknown; title?: unknown };
    if (typeof body.id !== 'string' || typeof body.title !== 'string') return NextResponse.json({ error: 'Invalid title update.' }, { status: 400 });
    const title = body.title.trim();
    if (title.length > 140) return NextResponse.json({ error: 'Keep titles under 140 characters.' }, { status: 400 });
    const video = await setVimeoLibraryCustomTitle(body.id, title || null);
    return video ? NextResponse.json({ id: video.id, customTitle: video.customTitle ?? null }) : NextResponse.json({ error: 'Video not found.' }, { status: 404 });
  } catch { return NextResponse.json({ error: 'Could not save this title.' }, { status: 500 }); }
}
