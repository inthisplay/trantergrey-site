import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { getMuxLibraryAsset } from '../../../_lib/mux';
import { invalidateMuxBrowseIndex } from '../../../_lib/mux-library';
import { setAssetUnbrandedPage } from '../../../_lib/unbranded-page';

export async function onRequestPost({ request, env }: { request: Request; env: AdminEnvironment }) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const body = await request.json() as { assetId?: unknown; enabled?: unknown };
    if (typeof body.assetId !== 'string' || !/^[A-Za-z0-9]+$/.test(body.assetId) || typeof body.enabled !== 'boolean') return Response.json({ error: 'Choose a video and valid unbranded-page setting.' }, { status: 400 });
    const asset = await getMuxLibraryAsset(env, body.assetId);
    const project = await setAssetUnbrandedPage(env, asset, body.enabled);
    await invalidateMuxBrowseIndex(env);
    return Response.json({ project }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not update the unbranded page.' }, { status: 400 }); }
}
