import type { AdminEnvironment } from './admin';

export async function registerClient(env: AdminEnvironment, value: string) {
  const name = value.trim();
  if (!name) return;
  await env.TG_DATA.prepare('INSERT INTO client_directory (name, created_at) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET name = excluded.name')
    .bind(name, new Date().toISOString()).run();
}

export async function readClientDirectory(env: AdminEnvironment) {
  const rows = await env.TG_DATA.prepare('SELECT name FROM client_directory ORDER BY name COLLATE NOCASE').all<{ name: string }>();
  return rows.results.map((row) => row.name);
}
