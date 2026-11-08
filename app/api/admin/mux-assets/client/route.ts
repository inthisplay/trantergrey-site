import { requireAdminApi } from '@/lib/admin-auth';
import { assignMuxAssetsToClient } from '@/lib/mux-library-metadata';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const body = await request.json() as { assetIds?: unknown; client?: unknown };
    return Response.json(await assignMuxAssetsToClient(body.assetIds, body.client));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not assign that client.' }, { status: 400 });
  }
}
