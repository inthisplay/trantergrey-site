import { adminResponse, adminSession, origin, type AdminEnvironment } from '../../_lib/admin';
import { createMuxDirectUpload, getMuxDirectUploadAssetId } from '../../_lib/mux';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try {
    const body = await request.json() as { title?: unknown };
    if (typeof body.title !== 'string' || !body.title.trim()) throw new Error('Choose a video file with a name.');
    const upload = await createMuxDirectUpload(env, body.title, origin(request));
    const actor = await adminSession(request, env);
    await env.TG_DATA.prepare(`INSERT INTO mux_asset_ingests (upload_id, requested_title, requested_at, uploader_name, uploader_email)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(upload_id) DO NOTHING`)
      .bind(upload.id, body.title.trim().slice(0, 255), new Date().toISOString(), actor?.name || null, actor?.email || null).run();
    return Response.json(upload);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not prepare that upload.' }, { status: 400 }); }
}

export async function onRequestGet({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try {
    const uploadId = new URL(request.url).searchParams.get('uploadId') || '';
    const assetId = await getMuxDirectUploadAssetId(env, uploadId);
    await env.TG_DATA.prepare('UPDATE mux_asset_ingests SET asset_id = ? WHERE upload_id = ?').bind(assetId, uploadId).run();
    return Response.json({ assetId });
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not check that upload.' }, { status: 400 }); }
}
