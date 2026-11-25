import type { AdminEnvironment } from './admin';

// Only app-generated logo keys are eligible. No gallery/archive/Drive media is touched.
export async function cleanupUnusedLogos(env: AdminEnvironment) {
  const bucket=env.PRODUCTION_ARCHIVE;
  if(!bucket)return;
  if(!bucket.list || !bucket.delete)throw new Error('Logo maintenance storage is unavailable.');
  const saved=await env.TG_DATA.prepare("SELECT cursor FROM maintenance_cursors WHERE id='client-logos'").first<{cursor:string}>();
  const page=await bucket.list({prefix:'client-logos/',limit:100,...(saved?.cursor?{cursor:saved.cursor}:{})});
  const cutoff=Date.now()-7*86400000;
  for(const object of page.objects) {
    if(!/^client-logos\/[^/]+\/[a-f0-9-]{36}$/i.test(object.key) || !Number.isFinite(object.uploaded.getTime()) || object.uploaded.getTime()>=cutoff)continue;
    // Public pages resolve the directory's current logo; they never own another copy.
    const referenced=await env.TG_DATA.prepare('SELECT id FROM client_directory WHERE logo_key=? LIMIT 1').bind(object.key).first();
    if(!referenced)await bucket.delete(object.key);
  }
  await env.TG_DATA.prepare("INSERT INTO maintenance_cursors(id,cursor) VALUES('client-logos',?) ON CONFLICT(id) DO UPDATE SET cursor=excluded.cursor").bind(page.truncated?page.cursor||'':'').run();
}

export async function cleanupUnusedOAuthClients(env: AdminEnvironment & {MCP_AUTH: AdminEnvironment['TG_DATA']}) {
  const now=Math.floor(Date.now()/1000);
  // Older registrations receive a fresh grace period. Existing grants protect
  // their registration, irrespective of scope, invitation, or age.
  await env.MCP_AUTH.prepare(`UPDATE oauth_records SET data=json_set(data,'$.registeredAt',?,'$.authorizedAt',
    CASE WHEN EXISTS(SELECT 1 FROM oauth_records g WHERE json_extract(g.data,'$.clientId')=oauth_records.id AND g.kind IN ('session','refresh','token') AND g.expires_at>?) THEN ? ELSE NULL END)
    WHERE kind='client' AND id IN(SELECT id FROM oauth_records WHERE kind='client' AND json_extract(data,'$.registeredAt') IS NULL LIMIT 100)`).bind(now,now,now).run();
  await env.MCP_AUTH.prepare(`DELETE FROM oauth_records WHERE kind='client' AND id IN (
    SELECT c.id FROM oauth_records c WHERE c.kind='client' AND json_extract(c.data,'$.registeredAt')<? AND json_extract(c.data,'$.authorizedAt') IS NULL
    AND NOT EXISTS(SELECT 1 FROM oauth_records g WHERE json_extract(g.data,'$.clientId')=c.id AND g.kind IN ('pending','code','session','refresh','token') AND g.expires_at>?) LIMIT 100
  )`).bind(now-30*86400,now).run();
}
