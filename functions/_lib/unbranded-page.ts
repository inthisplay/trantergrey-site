import type { AdminEnvironment } from './admin';
import type { MuxLibraryAsset } from '../../lib/mux-shared';
import { createVideoProject, readMuxMetadata, readVideoProjectStore, updateVideoProject } from './mux-state';
import { publicProjectClient } from './client-public-logo';

export async function setAssetUnbrandedPage(env: AdminEnvironment, asset: MuxLibraryAsset, enabled: boolean) {
  const store = await readVideoProjectStore(env);
  const existing = store.projects.find(project => project.variants.some(variant => variant.assetId === asset.id));
  if (existing) return updateVideoProject(env, existing.id, { unbrandedPublicPage: enabled });
  if (!enabled) throw new Error('This video has no unbranded page enabled.');
  const metadata = await readMuxMetadata(env);
  const client = await publicProjectClient(env, { client: null, variants: [{ assetId: asset.id }] });
  const project = await createVideoProject(env, { title: metadata[asset.id]?.title || asset.title, client, variants: [{ assetId: asset.id }] }, [asset]);
  return updateVideoProject(env, project.id, { unbrandedPublicPage: true });
}
