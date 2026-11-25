import type { AdminEnvironment } from './admin';
import { decryptDriveSecret, encryptDriveSecret, digest, sharedDriveId, driveOAuthReady } from './client-drive-oauth';

type Cached = { connection_key: string; access_cipher: string | null; expires_at: number; lease_until: number };
// Persist encrypted tokens and leases in D1, not promises tied to another Worker request.
export async function cachedDriveToken(env: AdminEnvironment) {
  const connection = await env.TG_DATA.prepare("SELECT refresh_cipher,drive_id,needs_reconnect FROM client_drive_connection WHERE id='organization'").first<{refresh_cipher:string;drive_id:string;needs_reconnect:number}>();
  if (!connection || connection.needs_reconnect || connection.drive_id !== sharedDriveId(env) || !driveOAuthReady(env)) throw new Error('Connect or reconnect Google Drive to browse this client’s files.');
  const key = await digest(JSON.stringify([connection.refresh_cipher,connection.drive_id,env.GOOGLE_CLIENT_ID,env.GOOGLE_CLIENT_SECRET]));
  const owner = crypto.randomUUID(), deadline = Date.now()+12000;
  while (Date.now()<deadline) {
    const now=Date.now();
    const cached=await env.TG_DATA.prepare("SELECT connection_key,access_cipher,expires_at,lease_until FROM drive_access_cache WHERE id='organization'").first<Cached>();
    if(cached?.connection_key===key && cached.access_cipher && cached.expires_at>now+60000) return decryptDriveSecret(env,cached.access_cipher);
    if(cached?.connection_key===key && cached.lease_until>now) {await new Promise(resolve=>setTimeout(resolve,200));continue;}
    const lease=await env.TG_DATA.prepare(`INSERT INTO drive_access_cache(id,connection_key,lease_owner,lease_until) VALUES('organization',?,?,?)
      ON CONFLICT(id) DO UPDATE SET connection_key=excluded.connection_key,access_cipher=NULL,expires_at=0,lease_owner=excluded.lease_owner,lease_until=excluded.lease_until
      WHERE drive_access_cache.connection_key<>excluded.connection_key OR (drive_access_cache.lease_until<=? AND drive_access_cache.expires_at<=?) RETURNING id`).bind(key,owner,now+15000,now,now+60000).first();
    if(!lease)continue;
    try {
      const refresh=await decryptDriveSecret(env,connection.refresh_cipher);
      const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(10000),body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID!,client_secret:env.GOOGLE_CLIENT_SECRET!,refresh_token:refresh,grant_type:'refresh_token'})});
      const data=await response.json() as {access_token?:string;expires_in?:number;error?:string};
      if(data.error==='invalid_grant')await env.TG_DATA.prepare("UPDATE client_drive_connection SET needs_reconnect=1 WHERE id='organization' AND refresh_cipher=?").bind(connection.refresh_cipher).run();
      if(!response.ok || !data.access_token)throw new Error('The Google Drive connection needs to be authorized again.');
      // Missing/invalid expiry is never assumed cacheable.
      const lifetime=Number(data.expires_in);
      const expires=Number.isFinite(lifetime)&&lifetime>0 ? now+Math.min(lifetime,3600)*1000 : now;
      const saved=await env.TG_DATA.prepare(`UPDATE drive_access_cache SET access_cipher=?,expires_at=?,lease_owner=NULL,lease_until=0
        WHERE id='organization' AND connection_key=? AND lease_owner=? AND EXISTS(SELECT 1 FROM client_drive_connection WHERE id='organization' AND refresh_cipher=? AND needs_reconnect=0) RETURNING id`)
        .bind(await encryptDriveSecret(env,data.access_token),expires,key,owner,connection.refresh_cipher).first();
      if(!saved)throw new Error('The Drive connection changed. Please try again.');
      return data.access_token;
    } finally {
      await env.TG_DATA.prepare("UPDATE drive_access_cache SET lease_owner=NULL,lease_until=0 WHERE id='organization' AND connection_key=? AND lease_owner=?").bind(key,owner).run();
    }
  }
  throw new Error('Google Drive is taking longer than expected. Please try again.');
}
