import { requireAdminApi } from '@/lib/admin-auth';
import { createMuxStaticRendition, getMuxLibraryAsset } from '@/lib/mux-api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const assetId = new URL(request.url).searchParams.get('assetId') || '';
    if (!/^[A-Za-z0-9]+$/.test(assetId)) throw new Error('A valid Mux asset ID is required.');
    const asset = await getMuxLibraryAsset(assetId, { tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET });
    return Response.json({ staticRenditions: asset.staticRenditions });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not check the MP4 download.' }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const body = await request.json() as { assetId?: unknown };
    if (typeof body.assetId !== 'string' || !/^[A-Za-z0-9]+$/.test(body.assetId)) throw new Error('A valid Mux asset ID is required.');
    await createMuxStaticRendition(body.assetId, { tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not prepare the MP4 download.' }, { status: 400 });
  }
}
