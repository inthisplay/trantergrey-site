import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import type { TrialEnvironment } from './auth';
import { callbackUrl, signingKey, signedPost, smallJson, equal, hash, seconds, liveSession, pruneSubscriptions, eventName, eventDefinition } from '../../functions/_lib/mcp-events';
import { enforceRateLimit, recordIntegrationEvent } from '../../functions/_lib/integration-health';

const common = {
  name:z.literal(eventName), arguments:z.object({}).strict().default({}),
  cursor:z.null().optional(), ttlMs:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
};
const subscribe = z.object({ ...common, delivery:z.object({ mode:z.literal('webhook'),url:z.string().max(2048),secret:z.string().max(100) }) });
const unsubscribe = z.object({ name:common.name,arguments:common.arguments, delivery:z.object({mode:z.literal('webhook'),url:z.string().max(2048)}) });
type Existing = {secret:string;previous_secret:string|null;previous_until:number;verified_at:number};

export function registerEvents(server: McpServer, env: TrialEnvironment, sessionId?: string) {
  // The installed SDK permits extension handlers; its capability type predates
  // MCP Events. Keep the extension on the existing authenticated transport.
  server.server.registerCapabilities({events:{}} as Parameters<typeof server.server.registerCapabilities>[0]);
  async function guarded<T>(operation:string, fn:()=>Promise<T>):Promise<T> {
    try { return await fn(); }
    catch(error) {
      if(error instanceof McpError) throw error;
      await recordIntegrationEvent(env,'mcp',operation,'server_error',500);
      throw new McpError(-32603,'Event service unavailable. Try again later.');
    }
  }
  async function identity(url:string) {
    if(!sessionId || !await liveSession(env,sessionId)) throw new McpError(-32001,'An active persistent connection is required. Reconnect if necessary.');
    let callback:string;
    try {callback=callbackUrl(url);} catch {throw new McpError(-32602,'Callback must use the trusted HTTPS chatgpt.com host, without credentials or fragments.');}
    const id='sub_'+await hash(JSON.stringify([sessionId,eventName,{},callback]));
    return {id,callback};
  }
  server.server.setRequestHandler(z.object({method:z.literal('events/list'),params:z.unknown().optional()}),async({params})=>{
    if(!z.object({cursor:z.null().optional()}).safeParse(params ?? {}).success)throw new McpError(-32602,'Invalid event discovery parameters.');
    return {events:[eventDefinition]};
  });
  server.server.setRequestHandler(z.object({method:z.literal('events/subscribe'),params:z.unknown()}),async({params:input})=>guarded('event_subscribe',async()=>{
    const parsed=subscribe.safeParse(input); if(!parsed.success)throw new McpError(-32602,'Invalid subscription parameters. Use the event schema and a null replay cursor.');
    const params=parsed.data;
    const {id,callback}=await identity(params.delivery.url);
    const limited=await enforceRateLimit(env,'mcp','event_subscribe',sessionId!,20);
    if(limited)throw new McpError(-32000,'Too many subscription requests. Retry in one minute.');
    try{signingKey(params.delivery.secret);}catch{throw new McpError(-32602,'Expected a whsec_ secret containing 24–64 base64-encoded bytes.');}
    await pruneSubscriptions(env);
    const old=await env.MCP_AUTH.prepare('SELECT secret,previous_secret,previous_until,verified_at FROM mcp_event_subscriptions WHERE id=?').bind(id).first<Existing>();
    const now=seconds(), secret=params.delivery.secret;
    if(!old || old.secret!==secret || old.verified_at<now-300) {
      const challenge=crypto.randomUUID()+crypto.randomUUID();
      try {
        const response=await signedPost(callback,id,secret,'verify_'+crypto.randomUUID(),{type:'verification',challenge},old?.secret);
        if(!response.ok){await response.body?.cancel();throw new Error();}
        const reply=await smallJson(response);
        if(typeof reply?.challenge!=='string' || !equal(challenge,reply.challenge))throw new Error();
      } catch {
        await recordIntegrationEvent(env,'mcp','event_verification','server_error',502);
        throw new McpError(-32015,'Callback verification failed.',{reason:'challenge_failed'});
      }
    }
    if(!await liveSession(env,sessionId!))throw new McpError(-32001,'Connection revoked.');
    // Finite renewable subscriptions even when the caller requests no expiry.
    const ttl=Math.max(60,Math.min(30*86400,Math.floor((params.ttlMs ?? (params.ttlMs===null?30:7)*86400000)/1000)));
    const expires=seconds()+ttl;
    const changed=old && old.secret!==secret;
    const saved=await env.MCP_AUTH.prepare(`INSERT INTO mcp_event_subscriptions(id,session_id,callback_url,secret,previous_secret,previous_until,verified_at,expires_at,created_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM mcp_event_subscriptions WHERE session_id=?)<10 OR EXISTS(SELECT 1 FROM mcp_event_subscriptions WHERE id=?)
      ON CONFLICT(id) DO UPDATE SET secret=excluded.secret,previous_secret=excluded.previous_secret,previous_until=excluded.previous_until,verified_at=excluded.verified_at,expires_at=excluded.expires_at
      RETURNING id`).bind(id,sessionId,callback,secret,changed?old.secret:old?.previous_secret||null,changed?seconds()+300:old?.previous_until||0,seconds(),expires,seconds(),sessionId,id).first();
    if(!saved)throw new McpError(-32000,'This connection has reached its limit of 10 active subscriptions. Unsubscribe from an existing event first.');
    return {id,refreshBefore:new Date(expires*1000).toISOString(),cursor:null,truncated:false};
  }));
  server.server.setRequestHandler(z.object({method:z.literal('events/unsubscribe'),params:z.unknown()}),async({params:input})=>guarded('event_unsubscribe',async()=>{
    const parsed=unsubscribe.safeParse(input); if(!parsed.success)throw new McpError(-32602,'Invalid unsubscribe parameters.');
    const params=parsed.data;
    const {id}=await identity(params.delivery.url);
    await env.MCP_AUTH.batch([
      env.MCP_AUTH.prepare('DELETE FROM mcp_event_deliveries WHERE subscription_id=?').bind(id),
      env.MCP_AUTH.prepare('DELETE FROM mcp_event_subscriptions WHERE id=?').bind(id),
    ]);
    return {};
  }));
}
