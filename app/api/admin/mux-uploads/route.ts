import { requireAdminApi } from '@/lib/admin-auth';
import { createMuxDirectUpload, getMuxDirectUploadAssetId } from '@/lib/mux-api';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const body = await request.json() as { title?: unknown };
    if (typeof body.title !== 'string' || !body.title.trim()) throw new Error('Choose a video file with a name.');
    return Response.json(await createMuxDirectUpload(body.title, new URL(request.url).origin, { tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not prepare that upload.' }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const uploadId = new URL(request.url).searchParams.get('uploadId') || '';
    if (!/^[A-Za-z0-9]+$/.test(uploadId)) throw new Error('A valid Mux upload ID is required.');
    const assetId = await getMuxDirectUploadAssetId(uploadId, { tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET });
    return Response.json({ assetId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not check that upload.' }, { status: 400 });
  }
}
