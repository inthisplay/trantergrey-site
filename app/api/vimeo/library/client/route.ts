import { NextResponse } from 'next/server';
import { setVimeoLibraryClient } from '@/lib/vimeo-library';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Curation requires the protected admin area.' }, { status: 403 });
  try {
    const body = await request.json() as { id?: unknown; client?: unknown };
    if (typeof body.id !== 'string' || typeof body.client !== 'string') return NextResponse.json({ error: 'Invalid client update.' }, { status: 400 });
    const client = body.client.trim();
    if (client.length > 80) return NextResponse.json({ error: 'Keep client names under 80 characters.' }, { status: 400 });
    const video = await setVimeoLibraryClient(body.id, client || null);
    return video ? NextResponse.json({ id: video.id, client: video.client ?? null }) : NextResponse.json({ error: 'Video not found.' }, { status: 404 });
  } catch { return NextResponse.json({ error: 'Could not save this client.' }, { status: 500 }); }
}
