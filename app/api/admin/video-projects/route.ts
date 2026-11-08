import { requireAdminApi } from '@/lib/admin-auth';
import { getMuxLibraryAssets } from '@/lib/mux-api';
import { createVideoProject, deleteVideoProject, getVideoProjectStore } from '@/lib/video-projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  return Response.json(await getVideoProjectStore());
}

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const body = await request.json();
    const assets = await getMuxLibraryAssets({ tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET });
    const project = await createVideoProject(body, assets);
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not create this video project.' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const body = await request.json() as { projectId?: unknown };
    const project = await deleteVideoProject(body.projectId);
    return Response.json({ project });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not remove this video page.' }, { status: 400 });
  }
}
