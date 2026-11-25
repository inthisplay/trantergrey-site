import type { AdminEnvironment } from './admin';
import { recordIntegrationEvent } from './integration-health';

export type EventEnvironment = AdminEnvironment & { MCP_AUTH: AdminEnvironment['TG_DATA'] };
export const eventName = 'mux.asset.ready';
export const eventDefinition = {
  name: eventName,
  description: 'A new Mux asset is ready for playback. Future assets only; no historical replay. Fetch current details with get_video using assetId. Timing, follow-up checks and notifications are controlled by the subscribing Dot/user, not this server. Duplicate deliveries retain eventId.',
  delivery: ['webhook'],
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  payloadSchema: { type: 'object', properties: { assetId: { type: 'string' } }, required: ['assetId'], additionalProperties: false },
};
export const seconds = () => Math.floor(Date.now() / 1000);
export function equal(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length,y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
export async function hash(value: string) {
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function callbackUrl(value: string) {
  const url = new URL(value);
  // This integration is exclusively for ChatGPT/Dot. Fixed, exact trusted
  // hostnames prevent callers choosing private IPs, attacker-controlled DNS or
  // lookalike/subdomains. Never widen this to arbitrary subscription URLs.
  if (!['https://chatgpt.com','https://connectors.api.openai.com'].includes(url.origin) || url.username || url.password || url.hash || url.pathname === '/') throw new Error('invalid_callback');
  return url.href;
}
export function signingKey(secret: string) {
  if (!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)) throw new Error('invalid_secret');
  const key = Uint8Array.from(atob(secret.slice(6)), c => c.charCodeAt(0));
  if (key.length < 24 || key.length > 64) throw new Error('invalid_secret');
  return key;
}
async function signature(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw',signingKey(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return 'v1,' + btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))));
}
export async function signedPost(url: string, subscriptionId: string, secret: string, eventId: string, payload: unknown, previousSecret?: string | null) {
  const body = JSON.stringify(payload), timestamp = String(seconds());
  const signed = `${eventId}.${timestamp}.${body}`;
  const signatures = [await signature(secret,signed)];
  if (previousSecret && previousSecret !== secret) signatures.push(await signature(previousSecret,signed));
  // Workers rejects redirect:'error' before sending. Manual returns redirects
  // unfollowed; callers reject every non-2xx response.
  return fetch(callbackUrl(url), { method:'POST', redirect:'manual', signal:AbortSignal.timeout(10000),
    headers: {'Content-Type':'application/json','webhook-id':eventId,'webhook-timestamp':timestamp,
      'webhook-signature':signatures.join(' '),'X-MCP-Subscription-Id':subscriptionId}, body });
}
export async function smallJson(response: Response) {
  const reader=response.body?.getReader(); if (!reader) throw new Error('empty_response');
  const chunks: Uint8Array[]=[]; let size=0;
  try {
    while (true) { const {value,done}=await reader.read(); if(done)break; size+=value.length; if(size>4096)throw new Error('large_response'); chunks.push(value); }
  } finally { await reader.cancel().catch(()=>{}); }
  const body=new Uint8Array(size); let offset=0; for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(body));
}
export async function liveSession(env: EventEnvironment, sessionId: string) {
  return env.MCP_AUTH.prepare(`SELECT s.id FROM oauth_records s WHERE s.kind='session' AND s.id=? AND s.expires_at>?
    AND instr(' ' || COALESCE(json_extract(s.data,'$.scope'),'') || ' ', ' tg:personal ') > 0
    AND (json_extract(s.data,'$.invitationId') IS NULL OR EXISTS
      (SELECT 1 FROM mcp_invitations i WHERE i.id=json_extract(s.data,'$.invitationId') AND i.revoked_at IS NULL AND i.redeemed_at IS NOT NULL))`)
    .bind(sessionId,seconds()).first();
}
export async function pruneSubscriptions(env: EventEnvironment) {
  await env.MCP_AUTH.batch([
    env.MCP_AUTH.prepare(`DELETE FROM mcp_event_subscriptions WHERE expires_at<=? OR NOT EXISTS
      (SELECT 1 FROM oauth_records s WHERE s.kind='session' AND s.id=mcp_event_subscriptions.session_id AND s.expires_at>?
      AND instr(' ' || COALESCE(json_extract(s.data,'$.scope'),'') || ' ', ' tg:personal ') > 0 AND (json_extract(s.data,'$.invitationId') IS NULL OR EXISTS
      (SELECT 1 FROM mcp_invitations i WHERE i.id=json_extract(s.data,'$.invitationId') AND i.revoked_at IS NULL AND i.redeemed_at IS NOT NULL)))`).bind(seconds(),seconds()),
    env.MCP_AUTH.prepare('DELETE FROM mcp_event_deliveries WHERE subscription_id NOT IN (SELECT id FROM mcp_event_subscriptions) OR finished_at<?').bind(seconds()-30*86400),
    env.MCP_AUTH.prepare('UPDATE mcp_event_subscriptions SET previous_secret=NULL WHERE previous_until<=?').bind(seconds()),
  ]);
}
// Called only after verifying Mux's signature. Database batch commits the event
// and fan-out together, BEFORE acknowledging receipt to Mux.
export async function enqueueMuxReady(env: EventEnvironment, event: { id: string; created_at: string; data: { id: string } }) {
  const eventId='mux_ready_'+await hash(event.data.id), receipt=crypto.randomUUID(), now=seconds();
  const payload=JSON.stringify({eventId,name:eventName,timestamp:new Date(event.created_at).toISOString(),data:{assetId:event.data.id},cursor:null});
  await env.MCP_AUTH.batch([
    env.MCP_AUTH.prepare('INSERT OR IGNORE INTO mcp_mux_events(asset_id,event_id,payload,receipt_id,received_at) VALUES(?,?,?,?,?)').bind(event.data.id,eventId,payload,receipt,now),
    env.MCP_AUTH.prepare(`INSERT OR IGNORE INTO mcp_event_deliveries(subscription_id,event_id,next_attempt)
      SELECT s.id,e.event_id,? FROM mcp_event_subscriptions s JOIN mcp_mux_events e ON e.receipt_id=?
      WHERE s.expires_at>?`).bind(now,receipt,now),
  ]);
}
type Subscription = {id:string;session_id:string;callback_url:string;secret:string;previous_secret:string|null;previous_until:number;expires_at:number};
export async function deliverEvents(env: EventEnvironment, limit=5) {
  await pruneSubscriptions(env);
  const now=seconds(), lease=crypto.randomUUID();
  const claimed=await env.MCP_AUTH.prepare(`UPDATE mcp_event_deliveries SET lease_id=?,lease_until=?,attempts=attempts+1
    WHERE rowid IN (SELECT rowid FROM mcp_event_deliveries WHERE state='pending' AND next_attempt<=? AND lease_until<=? ORDER BY next_attempt LIMIT ?)
    RETURNING subscription_id,event_id,attempts`).bind(lease,now+120,now,now,Math.min(limit,20)).all<{subscription_id:string;event_id:string;attempts:number}>();
  for(let start=0;start<claimed.results.length;start+=5) await Promise.all(claimed.results.slice(start,start+5).map(async delivery=>{
    const sub=await env.MCP_AUTH.prepare('SELECT * FROM mcp_event_subscriptions WHERE id=? AND expires_at>?').bind(delivery.subscription_id,seconds()).first<Subscription>();
    const event=await env.MCP_AUTH.prepare('SELECT payload FROM mcp_mux_events WHERE event_id=?').bind(delivery.event_id).first<{payload:string}>();
    if(!sub || !event || !await liveSession(env,sub.session_id)) {
      await env.MCP_AUTH.prepare('DELETE FROM mcp_event_deliveries WHERE subscription_id=? AND event_id=? AND lease_id=?').bind(delivery.subscription_id,delivery.event_id,lease).run(); return;
    }
    let status=0;
    try {
      const response=await signedPost(sub.callback_url,sub.id,sub.secret,delivery.event_id,JSON.parse(event.payload),sub.previous_until>seconds()?sub.previous_secret:null);
      status=response.status; await response.body?.cancel();
    } catch { /* Do not log callback URLs, signing keys or response bodies. */ }
    if(status===410) {
      await env.MCP_AUTH.batch([env.MCP_AUTH.prepare('DELETE FROM mcp_event_subscriptions WHERE id=?').bind(sub.id),env.MCP_AUTH.prepare('DELETE FROM mcp_event_deliveries WHERE subscription_id=?').bind(sub.id)]);
      await recordIntegrationEvent(env,'mcp','event_receiver_gone','server_error',410); return;
    }
    const delivered=status>=200 && status<300;
    const retryable=status===0 || status===408 || status===429 || status>=500;
    const terminal=delivered || !retryable || delivery.attempts>=10;
    await env.MCP_AUTH.prepare(`UPDATE mcp_event_deliveries SET state=?,next_attempt=?,lease_until=0,lease_id=NULL,finished_at=?
      WHERE subscription_id=? AND event_id=? AND lease_id=?`).bind(delivered?'delivered':terminal?'failed':'pending',seconds()+Math.min(3600,30*2**(delivery.attempts-1)),terminal?seconds():null,sub.id,delivery.event_id,lease).run();
    if(!delivered) await recordIntegrationEvent(env,'mcp',terminal?'event_delivery_failed':'event_delivery_retry','server_error',status||503);
  }));
}
