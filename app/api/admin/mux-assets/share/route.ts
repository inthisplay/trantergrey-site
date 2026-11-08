import { requireAdminApi } from '@/lib/admin-auth';
import { createMuxPublicPlaybackId, getMuxLibraryAssets } from '@/lib/mux-api';
import { getMuxLibraryMetadata } from '@/lib/mux-library-metadata';
import { createVideoProject, getVideoProjectStore, ratioLabel, videoProjectSlug } from '@/lib/video-projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  try {
    const body = await request.json() as { assetId?: unknown };
    if (typeof body.assetId !== 'string' || !/^[A-Za-z0-9]+$/.test(body.assetId)) {
      throw new Error('A valid Mux asset ID is required.');
    }

    const store = await getVideoProjectStore();
    const existing = store.projects.find((project) => project.variants.some((variant) => variant.assetId === body.assetId));
    if (existing) return Response.json({ project: existing });

    const credentials = { tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET };
    let assets = await getMuxLibraryAssets(credentials);
    let asset = assets.find((item) => item.id === body.assetId);
    if (!asset) throw new Error('That Mux video could not be found.');

    if (!asset.playbackId || asset.playbackPolicy !== 'public') {
      await createMuxPublicPlaybackId(asset.id, credentials);
      assets = await getMuxLibraryAssets(credentials);
      asset = assets.find((item) => item.id === body.assetId);
      if (!asset?.playbackId || asset.playbackPolicy !== 'public') {
        throw new Error('Mux has not finished enabling public playback. Please try again in a moment.');
      }
    }

    const metadata = await getMuxLibraryMetadata();
    const baseSlug = videoProjectSlug(asset.title) || `video-${asset.id.slice(0, 8).toLowerCase()}`;
    const usedSlugs = new Set(store.projects.map((project) => project.slug));
    let slug = baseSlug;
    if (usedSlugs.has(slug)) slug = `${baseSlug}-${asset.id.slice(0, 6).toLowerCase()}`;

    const project = await createVideoProject({
      title: asset.title,
      slug,
      client: metadata.clientsByAssetId[asset.id] || asset.historicClient || '',
      variants: [{ assetId: asset.id, label: ratioLabel(asset.aspectRatio) }],
    }, assets);

    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not create a public video link.' }, { status: 400 });
  }
}
