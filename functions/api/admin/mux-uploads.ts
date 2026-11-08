import { adminResponse, origin, type AdminEnvironment } from '../../_lib/admin';
import { createMuxDirectUpload, getMuxDirectUploadAssetId } from '../../_lib/mux';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try {
    const body = await request.json() as { title?: unknown };
    if (typeof body.title !== 'string' || !body.title.trim()) throw new Error('Choose a video file with a name.');
    return Response.json(await createMuxDirectUpload(env, body.title, origin(request)));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not prepare that upload.' }, { status: 400 }); }
}

export async function onRequestGet({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try { return Response.json({ assetId: await getMuxDirectUploadAssetId(env, new URL(request.url).searchParams.get('uploadId') || '') }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not check that upload.' }, { status: 400 }); }
}
