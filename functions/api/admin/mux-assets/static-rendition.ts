import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { createMuxStaticRendition, getMuxLibraryAsset } from '../../../_lib/mux';

type Context = { request: Request; env: AdminEnvironment };
export async function onRequestGet({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try { return Response.json({ staticRenditions: (await getMuxLibraryAsset(env, new URL(request.url).searchParams.get('assetId') || '')).staticRenditions }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not check the MP4 download.' }, { status: 400 }); }
}
export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try { const body = await request.json() as { assetId?: unknown }; if (typeof body.assetId !== 'string') throw new Error('A valid Mux asset ID is required.'); await createMuxStaticRendition(env, body.assetId); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not prepare the MP4 download.' }, { status: 400 }); }
}
