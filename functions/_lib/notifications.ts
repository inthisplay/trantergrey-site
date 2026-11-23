import { z } from 'zod';
import { buildPushPayload } from '@block65/webcrypto-web-push';
import type { AdminEnvironment } from './admin';
import type { ApiActor } from './internal-api';
import { enforceRateLimit, recordIntegrationEvent } from './integration-health';

export class NotificationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const sendNotificationSchema = z.object({
  requestId: z.string().uuid(),
  recipients: z.array(z.string().email().max(254).transform(s => s.toLowerCase())).min(1).max(25),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
  href: z.string().max(1000).default('/app/inbox'),
}).strict();
export function safeNotificationHref(href: string) {
  if (!/^\/app(?:\/|$|\?)/.test(href) || /[\\\x00-\x20]/.test(href)) return false;
  const url = new URL(href, 'https://trantergrey.com');
  return url.origin === 'https://trantergrey.com' && /^\/app(?:\/|$)/.test(url.pathname);
}
export async function notificationRecipients(env: AdminEnvironment) {
  return (await env.TG_DATA.prepare('SELECT lower(email) AS email,nickname AS name FROM admin_team_directory ORDER BY nickname,email').all<{ email: string; name: string }>()).results;
}
export async function sendNotification(env: AdminEnvironment, actor: ApiActor, raw: unknown) {
  if (!actor.scopes.has('notifications:send')) throw new NotificationError('Reconnect with notifications:send permission to send team notifications.',403);
  const parsed = sendNotificationSchema.safeParse(raw);
  if (!parsed.success) throw new NotificationError('Provide a UUID requestId, 1–25 recipient emails, title, body and an internal /app link.');
  const input = parsed.data; input.recipients = [...new Set(input.recipients)].sort();
  if (!safeNotificationHref(input.href)) throw new NotificationError('Notification links must stay inside /app.');
  const payload = JSON.stringify(input), actorId = `${actor.type}:${actor.id}`;
  const previous = await env.TG_DATA.prepare('SELECT payload FROM notification_requests WHERE actor_id=? AND request_id=?').bind(actorId,input.requestId).first<{payload:string}>();
  if (previous && previous.payload !== payload) throw new NotificationError('This requestId was already used with different details.',409);
  if (!previous) {
    if(await enforceRateLimit(env,'api','notifications/send',actorId,10)) throw new NotificationError('Notification limit reached. Wait one minute and retry with the same requestId.',429);
    const valid = new Set((await notificationRecipients(env)).map(r => r.email));
    if (input.recipients.some(email => !valid.has(email))) throw new NotificationError('Select exact recipient emails from the team directory.');
    const createdAt = new Date().toISOString();
    const statements = [env.TG_DATA.prepare('INSERT OR IGNORE INTO notification_requests(actor_id,request_id,payload,created_at) VALUES(?,?,?,?)').bind(actorId,input.requestId,payload,createdAt)];
    for (const recipient of input.recipients) {
      const id = crypto.randomUUID();
      statements.push(env.TG_DATA.prepare(`INSERT OR IGNORE INTO team_notifications(id,actor_id,request_id,recipient,title,body,href,created_at)
        SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM notification_requests WHERE actor_id=? AND request_id=? AND payload=?)`)
        .bind(id,actorId,input.requestId,recipient,input.title,input.body,input.href,createdAt,actorId,input.requestId,payload));
      // Only the winning insert's ID can create jobs. Retrying later never pushes again.
      statements.push(env.TG_DATA.prepare(`INSERT OR IGNORE INTO notification_push_jobs(notification_id,subscription_id)
        SELECT ?,s.id FROM push_subscriptions s JOIN admin_sessions a ON a.id=s.session_id
        WHERE s.recipient=? AND lower(a.user_email)=s.recipient AND a.expires_at>?
        AND EXISTS(SELECT 1 FROM team_notifications WHERE id=?)`).bind(id,recipient,createdAt,id));
    }
    await env.TG_DATA.batch(statements);
    const saved = await env.TG_DATA.prepare('SELECT payload FROM notification_requests WHERE actor_id=? AND request_id=?').bind(actorId,input.requestId).first<{payload:string}>();
    if (saved?.payload !== payload) throw new NotificationError('This requestId was already used with different details.',409);
  }
  const notifications = (await env.TG_DATA.prepare(`SELECT n.id,n.recipient,n.read_at AS readAt,
    (SELECT count(*) FROM notification_push_jobs j WHERE j.notification_id=n.id AND j.status='pending') AS pushQueued,
    (SELECT count(*) FROM notification_push_jobs j WHERE j.notification_id=n.id AND j.status='accepted') AS pushAccepted,
    (SELECT count(*) FROM notification_push_jobs j WHERE j.notification_id=n.id AND j.status='failed') AS pushFailed
    FROM team_notifications n WHERE n.actor_id=? AND n.request_id=? ORDER BY n.recipient`).bind(actorId,input.requestId).all()).results;
  return { requestId: input.requestId, saved: true, notifications, note: 'Saved to inbox. Push acceptance is not proof of delivery or reading.' };
}

export async function readInbox(env: AdminEnvironment, recipient: string, url: URL) {
  const limit = Number(url.searchParams.get('limit') || 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new NotificationError('limit must be 1–50.');
  let cursor: string[] | null = null;
  if (url.searchParams.has('cursor')) {
    try { cursor = JSON.parse(atob(url.searchParams.get('cursor')!)); } catch { throw new NotificationError('Invalid cursor.'); }
    if (!Array.isArray(cursor) || cursor.length!==2 || cursor.some(s=>typeof s!=='string'||s.length>100)) throw new NotificationError('Invalid cursor.');
  }
  const id = url.searchParams.get('id');
  const args: unknown[] = [recipient];
  let filter = '';
  if(id) { filter=' AND id=?'; args.push(id); }
  else if(cursor) { filter=' AND (created_at<? OR (created_at=? AND id<?))'; args.push(cursor[0],cursor[0],cursor[1]); }
  const rows = (await env.TG_DATA.prepare(`SELECT id,title,body,href,created_at AS createdAt,read_at AS readAt FROM team_notifications WHERE recipient=?${filter} ORDER BY created_at DESC,id DESC LIMIT ?`).bind(...args,limit+1).all<{id:string;title:string;body:string;href:string;createdAt:string;readAt:string|null}>()).results;
  const last = rows[limit-1];
  const count = await env.TG_DATA.prepare('SELECT count(*) AS count FROM team_notifications WHERE recipient=? AND read_at IS NULL').bind(recipient).first<{count:number}>();
  return { items: rows.slice(0,limit), unread: count?.count||0, nextCursor: rows.length>limit ? btoa(JSON.stringify([last.createdAt,last.id])) : null };
}

// Known browser push services only. Never allow arbitrary network targets or redirects.
export function validPushEndpoint(endpoint: string) {
  try { const u = new URL(endpoint); return u.protocol==='https:' && !u.username && !u.password && !u.port && !u.hash &&
    (u.hostname==='fcm.googleapis.com' || u.hostname==='updates.push.services.mozilla.com' || u.hostname==='updates-autopush.wp1.mozaws.net' || u.hostname==='web.push.apple.com' || u.hostname.endsWith('.push.apple.com') || u.hostname==='wns2-par02p.notify.windows.com' || u.hostname.endsWith('.notify.windows.com')); } catch { return false; }
}
export const subscriptionSchema = z.object({endpoint:z.string().max(2048), keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}$/)})});
export async function saveSubscription(env: AdminEnvironment, recipient: string, sessionId: string, raw: unknown) {
  const parsed=subscriptionSchema.safeParse(raw);
  if(!parsed.success||!validPushEndpoint(parsed.data.endpoint)) throw new NotificationError('Unsupported push subscription.');
  const s=parsed.data;
  const bytes=Uint8Array.from(atob(s.keys.p256dh.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  try { await crypto.subtle.importKey('raw',bytes,{name:'ECDH',namedCurve:'P-256'},false,[]); } catch { throw new NotificationError('Invalid push key.'); }
  const count=await env.TG_DATA.prepare('SELECT count(*) AS count FROM push_subscriptions WHERE recipient=? AND endpoint<>?').bind(recipient,s.endpoint).first<{count:number}>();
  if((count?.count||0)>=10)throw new NotificationError('Up to 10 devices can receive push. Turn off push on an old device first.');
  const now=new Date().toISOString(), id=crypto.randomUUID();
  // Replace rather than transfer jobs from a previous user/device key.
  await env.TG_DATA.batch([
    env.TG_DATA.prepare('DELETE FROM notification_push_jobs WHERE subscription_id IN (SELECT id FROM push_subscriptions WHERE endpoint=?)').bind(s.endpoint),
    env.TG_DATA.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(s.endpoint),
    env.TG_DATA.prepare('INSERT INTO push_subscriptions(id,recipient,session_id,endpoint,p256dh,auth,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,recipient,sessionId,s.endpoint,s.keys.p256dh,s.keys.auth,now,now),
  ]);
  return { enabled: true };
}

export function pushPreview(value:string,limit:number) {
  const chars=Array.from(value.replace(/\s+/g,' ').trim());
  return chars.length>limit?chars.slice(0,limit-1).join('')+'…':chars.join('');
}

type PushJob={notification_id:string;subscription_id:string;endpoint:string;p256dh:string;auth:string;attempts:number;title:string;body:string};
export async function deliverNotificationPush(env: AdminEnvironment, limit=20) {
  if(!env.PUSH_VAPID_PUBLIC_KEY || !env.PUSH_VAPID_PRIVATE_KEY) return;
  const now=Date.now();
  // A crash after claiming the final attempt must not permit an unbounded retry.
  const exhausted=await env.TG_DATA.prepare("UPDATE notification_push_jobs SET status='failed',lease=NULL WHERE status='pending' AND attempts>=8 AND next_attempt<=? RETURNING notification_id").bind(now).first();
  if(exhausted)await recordIntegrationEvent(env,'api','notifications/push','server_error',503);
  // Expired/revoked sessions stop push. Inbox data survives for the next login.
  await env.TG_DATA.prepare(`UPDATE notification_push_jobs SET status='skipped' WHERE status='pending' AND NOT EXISTS (
    SELECT 1 FROM push_subscriptions s JOIN admin_sessions a ON a.id=s.session_id
    JOIN admin_team_directory t ON lower(t.email)=s.recipient
    WHERE s.id=subscription_id AND lower(a.user_email)=s.recipient AND a.expires_at>?)`).bind(new Date(now).toISOString()).run();
  const jobs=(await env.TG_DATA.prepare(`SELECT j.*,s.endpoint,s.p256dh,s.auth,n.title,n.body FROM notification_push_jobs j JOIN push_subscriptions s ON s.id=j.subscription_id JOIN team_notifications n ON n.id=j.notification_id AND n.recipient=s.recipient
    WHERE j.status='pending' AND j.next_attempt<=? ORDER BY j.next_attempt LIMIT ?`).bind(now,limit).all<PushJob>()).results;
  for(let i=0;i<jobs.length;i+=5) await Promise.all(jobs.slice(i,i+5).map(async job=>{
    const lease=crypto.randomUUID();
    const claimed=await env.TG_DATA.prepare(`UPDATE notification_push_jobs SET lease=?,next_attempt=?,attempts=attempts+1 WHERE notification_id=? AND subscription_id=? AND status='pending' AND next_attempt<=? RETURNING attempts`).bind(lease,now+120000,job.notification_id,job.subscription_id,now).first<{attempts:number}>();
    if(!claimed)return;
    let status=0;
    try {
      if(!validPushEndpoint(job.endpoint)) status=400;
      else {
        // Always include a bounded preview inside the encrypted Web Push payload.
        const payload=await buildPushPayload({data:JSON.stringify({id:job.notification_id,title:pushPreview(job.title,120),body:pushPreview(job.body,180)}),options:{ttl:86400}},
          {endpoint:job.endpoint,expirationTime:null,keys:{p256dh:job.p256dh,auth:job.auth}},
          {subject:'mailto:t.jackson@trantergrey.com',publicKey:env.PUSH_VAPID_PUBLIC_KEY!,privateKey:env.PUSH_VAPID_PRIVATE_KEY!});
        const response=await fetch(job.endpoint,{...payload,redirect:'manual',signal:AbortSignal.timeout(10000)});
        status=response.status; await response.body?.cancel();
      }
    } catch { status=0; }
    if(status===404||status===410) {
      await env.TG_DATA.batch([
        env.TG_DATA.prepare('DELETE FROM notification_push_jobs WHERE subscription_id=?').bind(job.subscription_id),
        env.TG_DATA.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(job.subscription_id),
      ]); return;
    }
    const retry=status===0||status===408||status===429||status>=500;
    const result=status>=200&&status<300?'accepted':retry&&claimed.attempts<8?'pending':'failed';
    await env.TG_DATA.prepare('UPDATE notification_push_jobs SET status=?,last_status=?,next_attempt=?,lease=NULL WHERE notification_id=? AND subscription_id=? AND lease=?')
      .bind(result,status,now+Math.min(3600000,30000*2**claimed.attempts),job.notification_id,job.subscription_id,lease).run();
    if(result==='failed') await recordIntegrationEvent(env,'api','notifications/push','server_error',status||503);
  }));
}

export async function notificationJson(request: Request) {
  const reader=request.body?.getReader();if(!reader)throw new NotificationError('JSON body required.');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();throw new NotificationError('Request too large.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new NotificationError('Invalid JSON.');}
}
