import { getVimeoLibrary } from '@/lib/vimeo-library';
import { toPublicVideo } from '@/lib/videos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const library = await getVimeoLibrary();
  const videos = library?.videos
    .filter((video) => video.libraryStatus === 'published')
    .map(toPublicVideo) ?? [];

  return Response.json(
    { videos },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
