import type { AdminEnvironment } from './admin';

type LogoProject = { client: string | null; unbrandedPublicPage?: boolean; variants?: { assetId: string }[] };

export async function publicProjectClient(env: AdminEnvironment, project: LogoProject): Promise<string | null> {
  if (project.client?.trim()) return project.client.trim();
  const ids = [...new Set((project.variants || []).map(variant => variant.assetId))];
  if (!ids.length) return null;
  // Imported video pages may have no project-level client. Resolve the same
  // saved metadata/current library assignment used by the admin library.
  const assignments = await Promise.all(ids.map(id => env.TG_DATA.prepare(`SELECT COALESCE(
    (SELECT NULLIF(TRIM(client),'') FROM mux_asset_metadata WHERE asset_id=?),
    (SELECT NULLIF(TRIM(client),'') FROM mux_library_browse_assets WHERE asset_id=? AND refresh_id=(SELECT refresh_id FROM mux_library_browse_state WHERE id='library'))
  ) AS client`).bind(id, id).first<{ client: string | null }>()));
  const names = assignments.map(row => row?.client || null);
  // Never guess between clients in a mixed or partly unassigned ratio group.
  if (names.some(name => !name)) return null;
  const unique = new Map(names.map(name => [name!.toLowerCase(), name!]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

// Only a project explicitly enabled for unbranded sharing can expose its client's logo.
export async function clientPublicLogo(env: AdminEnvironment, project: LogoProject) {
  if (project.unbrandedPublicPage !== true || !env.PRODUCTION_ARCHIVE) return null;
  const name = await publicProjectClient(env, project);
  if (!name) return null;
  const client = await env.TG_DATA.prepare('SELECT logo_key FROM client_directory WHERE name=? COLLATE NOCASE').bind(name).first<{ logo_key: string | null }>();
  return client?.logo_key || null;
}
