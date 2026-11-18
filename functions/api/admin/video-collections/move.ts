import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { readMuxBrowseAssetsById } from '../../../_lib/mux-library';
import { readVideoProjectStore } from '../../../_lib/mux-state';
import type { VideoProject, VideoProjectCollection } from '../../../../lib/video-projects-shared';
import { videoProjectSlug, ratioLabel } from '../../../../lib/video-projects-shared';

export async function onRequestPost({ request, env }: { request: Request; env: AdminEnvironment }) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try {
    const body = await request.json() as { assetIds?: string[]; destination?: string; name?: string; sourceCollectionId?: string };
    if (!Array.isArray(body.assetIds) || !body.assetIds.length || body.assetIds.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9]+$/.test(id))) throw new Error('Select valid videos.');
    const selected = new Set(body.assetIds);
    const store = await readVideoProjectStore(env);
    // Keep each lookup below D1's bound-parameter limit.
    const assetIds = [...selected];
    const assets: Awaited<ReturnType<typeof readMuxBrowseAssetsById>> = [];
    for (let start = 0; start < assetIds.length; start += 75) {
      assets.push(...await readMuxBrowseAssetsById(env, assetIds.slice(start, start + 75)));
    }
    if (assets.length !== selected.size) throw new Error('Some videos are no longer available. Refresh and try again.');
    const affected = store.projects.filter((p) => p.variants.some((v) => selected.has(v.assetId)));
    if (body.destination === 'solo' && !body.sourceCollectionId) throw new Error('Select videos from only one collection.');
    if (body.sourceCollectionId && (affected.some((p) => p.collectionIds.length !== 1 || p.collectionIds[0] !== body.sourceCollectionId) || assets.some((a) => !affected.some((p) => p.variants.some((v) => v.assetId === a.id))))) throw new Error('Select videos from only one collection.');
    if (body.sourceCollectionId === body.destination) throw new Error('Choose a different collection.');
    const now = new Date().toISOString();
    let destination: VideoProjectCollection | undefined;
    if (body.destination === 'new') {
      const name = body.name?.trim().slice(0, 120);
      if (!name || !videoProjectSlug(name)) throw new Error('Enter a collection name.');
      destination = { id: crypto.randomUUID(), name, slug: `${videoProjectSlug(name)}-${crypto.randomUUID().slice(0, 8)}`, description: null, tags: [], createdAt: now, updatedAt: now };
    } else if (body.destination !== 'solo') {
      destination = store.collections.find((c) => c.id === body.destination);
      if (!destination) throw new Error('Choose an existing collection.');
    }
    const collectionIds = destination ? [destination.id] : [];
    const updates: VideoProject[] = [];
    const attached = new Set<string>();
    for (const project of affected) {
      const moving = project.variants.filter((v) => selected.has(v.assetId));
      const remaining = project.variants.filter((v) => !selected.has(v.assetId));
      moving.forEach((v) => attached.add(v.assetId));
      if (!remaining.length && destination) updates.push({ ...project, collectionIds, updatedAt: now });
      else {
        if (remaining.length) updates.push({ ...project, variants: remaining, updatedAt: now });
        moving.forEach((variant, index) => {
          const asset = assets.find((a) => a.id === variant.assetId)!;
          const keepOriginal = !remaining.length && index === 0;
          updates.push({ ...project, id: keepOriginal ? project.id : crypto.randomUUID(), slug: keepOriginal ? project.slug : crypto.randomUUID(), legacySlugs: keepOriginal ? project.legacySlugs : [], title: asset.title, variants: [{ ...variant, order: 0 }], collectionIds, updatedAt: now });
        });
      }
    }
    for (const asset of assets.filter((a) => !attached.has(a.id))) updates.push({ id: crypto.randomUUID(), slug: asset.id, title: asset.title, client: asset.client, description: null, variants: [{ assetId: asset.id, label: ratioLabel(asset.aspectRatio), aspectRatio: asset.aspectRatio, order: 0 }], collectionIds, createdAt: now, updatedAt: now });
    // One atomic batch: a stale source or destination rolls back the entire move.
    const statements = affected.map((p) => env.TG_DATA.prepare("SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM mux_video_projects WHERE id = ? AND json(value) = json(?)) THEN json('stale selection') END").bind(p.id, JSON.stringify(p)));
    // Also detect a new owner added after the initial read, including loose videos.
    for (const id of selected) {
      const ownerCount = affected.filter((p) => p.variants.some((v) => v.assetId === id)).length;
      statements.push(env.TG_DATA.prepare("SELECT CASE WHEN (SELECT COUNT(*) FROM mux_video_projects p WHERE EXISTS (SELECT 1 FROM json_each(p.value, '$.variants') v WHERE json_extract(v.value, '$.assetId') = ?)) != ? THEN json('stale selection') END").bind(id, ownerCount));
    }
    if (destination && body.destination !== 'new') statements.push(env.TG_DATA.prepare("SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM mux_video_collections WHERE id = ? AND json(value) = json(?)) THEN json('stale destination') END").bind(destination.id, JSON.stringify(destination)));
    if (destination && body.destination === 'new') statements.push(env.TG_DATA.prepare('INSERT INTO mux_video_collections (id, slug, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(destination.id, destination.slug, JSON.stringify(destination), now, now));
    statements.push(...updates.map((p) => env.TG_DATA.prepare('INSERT INTO mux_video_projects (id, slug, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').bind(p.id, p.slug, JSON.stringify(p), p.createdAt, now)));
    // Invalidate within the transaction so success cannot be reported as a failure
    // merely because a later cache update failed. Null also expires an infinite TTL.
    statements.push(env.TG_DATA.prepare("UPDATE mux_library_browse_state SET refreshed_at = NULL WHERE id = ?").bind('library'));
    await env.TG_DATA.batch(statements);
    return Response.json(await readVideoProjectStore(env));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to move videos.';
    const stale = /malformed JSON/i.test(message);
    return Response.json({ error: stale ? 'The selection changed while you were moving it. Refresh the library and try again.' : message }, { status: stale ? 409 : 400 });
  }
}
