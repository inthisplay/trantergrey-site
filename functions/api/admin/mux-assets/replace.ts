import { adminResponse, adminSession, type AdminEnvironment } from '../../../_lib/admin';
import { replaceVideo, ReplacementError } from '../../../_lib/replace-video';

export async function onRequestPost({ request, env }: { request: Request; env: AdminEnvironment }) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const reader = request.body?.getReader(); let raw = ''; let size = 0;
    const decoder = new TextDecoder();
    if (reader) while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 2048) { await reader.cancel(); return Response.json({ error: 'Request too large.' }, { status: 413 }); } raw += decoder.decode(value, { stream: true }); }
    const body = JSON.parse(raw + decoder.decode());
    if (typeof body?.assetId !== 'string' || typeof body?.replacementAssetId !== 'string') throw new ReplacementError('Choose both videos.');
    return Response.json(await replaceVideo(env, body.assetId, body.replacementAssetId, (await adminSession(request, env))!.email!), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof ReplacementError ? error.message : 'Could not complete the replacement. The original video is retained; retry with the same replacement.' }, { status: error instanceof ReplacementError ? error.status : 503 });
  }
}
