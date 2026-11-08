import { requireAdminApi } from '@/lib/admin-auth';
import { getMuxLibraryAssets } from '@/lib/mux-api';
import { createVideoProjectCollection, getVideoProjectStore, updateVideoProjectCollection } from '@/lib/video-projects';

export const runtime = 'nodejs';

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  return Response.json(await getVideoProjectStore());
}

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const [body, assets] = await Promise.all([
      request.json(),
      getMuxLibraryAssets({ tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET }),
    ]);
    const result = await createVideoProjectCollection(body, assets);
    return Response.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not create this video collection.' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const body = await request.json() as { collectionId?: unknown; tags?: unknown };
    if (typeof body.collectionId !== 'string') throw new Error('A collection ID is required.');
    const collection = await updateVideoProjectCollection(body.collectionId, { tags: body.tags });
    return Response.json({ collection });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not update this video collection.' }, { status: 400 });
  }
}
