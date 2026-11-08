import { requireAdminApi } from '@/lib/admin-auth';
import { updateMuxAssetMetadata } from '@/lib/mux-library-metadata';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const body = await request.json() as { assetId?: unknown; title?: unknown; tags?: unknown; status?: unknown; downloadsEnabled?: unknown };
    const patch: { title?: unknown; tags?: unknown; status?: unknown; downloadsEnabled?: unknown } = {};
    if ('title' in body) patch.title = body.title;
    if ('tags' in body) patch.tags = body.tags;
    if ('status' in body) patch.status = body.status;
    if ('downloadsEnabled' in body) patch.downloadsEnabled = body.downloadsEnabled;
    return Response.json(await updateMuxAssetMetadata(body.assetId, patch));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not update that video.' }, { status: 400 });
  }
}
