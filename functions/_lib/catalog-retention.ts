import type { AdminEnvironment } from './admin';

// Leave a day for in-flight readers/builds. Active generations are never removed.
export async function cleanupCatalogSnapshots(env: AdminEnvironment, limit = 2000) {
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  const tables = [
    ['mux_library_assets', 'snapshot', 'mux_library_snapshot_state'],
    ['mux_library_browse_assets', 'browse', 'mux_library_browse_state'],
    ['mux_library_browse_search', 'browse', 'mux_library_browse_state'],
  ];
  await env.TG_DATA.batch(tables.map(([table, kind, state]) => env.TG_DATA.prepare(
    `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table}
      WHERE refresh_id IN (SELECT refresh_id FROM mux_catalog_generations WHERE kind=? AND created_at<?)
      AND refresh_id NOT IN (SELECT refresh_id FROM ${state} WHERE refresh_id IS NOT NULL) LIMIT ?)`
  ).bind(kind, cutoff, Math.min(10000, Math.max(1, limit)))));
  await env.TG_DATA.prepare(`DELETE FROM mux_catalog_generations WHERE created_at<?
    AND NOT EXISTS (SELECT 1 FROM mux_library_snapshot_state WHERE refresh_id=mux_catalog_generations.refresh_id)
    AND NOT EXISTS (SELECT 1 FROM mux_library_browse_state WHERE refresh_id=mux_catalog_generations.refresh_id)
    AND NOT EXISTS (SELECT 1 FROM mux_library_assets WHERE refresh_id=mux_catalog_generations.refresh_id)
    AND NOT EXISTS (SELECT 1 FROM mux_library_browse_assets WHERE refresh_id=mux_catalog_generations.refresh_id)
    AND NOT EXISTS (SELECT 1 FROM mux_library_browse_search WHERE refresh_id=mux_catalog_generations.refresh_id)`).bind(cutoff).run();
}
