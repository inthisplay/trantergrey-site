import { adminResponse, adminSession, origin, type AdminEnvironment } from '../../_lib/admin';
import { createMuxDirectUpload, getMuxDirectUploadStatus, getMuxLibraryAsset, invalidateMuxLibraryCache } from '../../_lib/mux';
import { invalidateMuxBrowseIndex, refreshMuxLibraryCatalog } from '../../_lib/mux-library';

type Context = { request: Request; env: AdminEnvironment; waitUntil(promise: Promise<unknown>): void };

/** Rebuild exactly once when the asset first exists and again when it is ready. */
async function refreshCatalogAtUploadMilestone(env: AdminEnvironment, waitUntil: Context['waitUntil'], uploadId: string, milestone: 'discovered' | 'ready') {
  const column = milestone === 'ready' ? 'catalog_ready_at' : 'catalog_discovered_at';
  const result = await env.TG_DATA.prepare(`UPDATE mux_asset_ingests SET ${column} = ? WHERE upload_id = ? AND ${column} IS NULL`)
    .bind(new Date().toISOString(), uploadId).run() as { meta?: { changes?: number } };
  if (!result.meta?.changes) return;
  waitUntil((async () => {
    await Promise.all([invalidateMuxLibraryCache(env), invalidateMuxBrowseIndex(env)]);
    await refreshMuxLibraryCatalog(env);
  })().catch(() => {
    console.error(`Mux ${milestone} catalog refresh failed`);
  }));
}

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

export async function onRequestGet({ request, env, waitUntil }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try {
    const query = new URL(request.url).searchParams;
    const requestedAsset = query.get('assetId');
    const uploadId = query.get('uploadId') || '';
    if (!/^[A-Za-z0-9]+$/.test(requestedAsset || uploadId)) return Response.json({ error: 'Invalid upload or asset ID.' }, { status: 400 });
    if (requestedAsset) {
      const asset = await getMuxLibraryAsset(env, requestedAsset);
      return Response.json({ assetId: asset.id, ready: asset.status === 'ready' && asset.playbackPolicy === 'public' && Boolean(asset.playbackId), status: asset.status, processing: asset.processing, playbackId: asset.playbackId, playbackPolicy: asset.playbackPolicy, duration: asset.duration }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const upload = await getMuxDirectUploadStatus(env, uploadId);
    const assetId = upload.assetId;
    // An upload gets an asset ID before Mux has made it usable.  Returning that
    // ID as "done" let the admin create a project while the asset was absent
    // from the library (or did not have public playback yet).
    if (!assetId) return Response.json({ assetId: null, ready: false, status: upload.status }, { headers: { 'Cache-Control': 'private, no-store' } });
    const asset = await getMuxLibraryAsset(env, assetId);
    const ready = asset.status === 'ready' && asset.playbackPolicy === 'public' && Boolean(asset.playbackId);
    await env.TG_DATA.prepare('UPDATE mux_asset_ingests SET asset_id = ? WHERE upload_id = ?').bind(assetId, uploadId).run();
    // During encoding, the first rebuild lets the library render its existing
    // processing overlay. Once Mux reports ready, a second rebuild swaps in
    // playable metadata. Repeated polling does not cause further rebuilds.
    await refreshCatalogAtUploadMilestone(env, waitUntil, uploadId, ready ? 'ready' : 'discovered');
    return Response.json({ assetId, ready, status: asset.status, processing: asset.processing }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  catch { return Response.json({ error: 'Upload status is temporarily unavailable. Please retry.' }, { status: 502 }); }
}
