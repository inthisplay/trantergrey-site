import { adminSession,type AdminEnvironment } from '../../_lib/admin';
import { apiData,apiError } from '../../_lib/internal-api';
import { readInbox,saveSubscription,sendNotification,NotificationError,notificationJson } from '../../_lib/notifications';
export async function onRequest({request,env}:{request:Request;env:AdminEnvironment}) {
  const session=await adminSession(request,env);
  if(!session?.email)return apiError('unauthorized','Sign in to see your inbox.',401);
  const recipient=session.email.toLowerCase();
  if(!await env.TG_DATA.prepare('SELECT email FROM admin_team_directory WHERE lower(email)=?').bind(recipient).first()) return apiError('forbidden','A team directory account is required.',403);
  const url=new URL(request.url);
  const sessionId=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('tg_admin='))?.slice(9)||'';
  try {
    if(request.method==='GET')return apiData({...await readInbox(env,recipient,url),publicKey:env.PUSH_VAPID_PUBLIC_KEY||null,email:recipient});
    if(request.method!=='POST')return apiError('method_not_allowed','Use GET or POST.',405);
    if(request.headers.get('origin')!==url.origin)return apiError('invalid_origin','Use the app to change your inbox settings.',403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return apiError('invalid_request','JSON is required.',415);
    const body=await notificationJson(request) as Record<string,unknown>|null;
    if(!body)return apiError('invalid_request','Invalid request.',400);
    if(body.action==='read') {
      if(typeof body.id!=='string')throw new NotificationError('A notification ID is required.');
      await env.TG_DATA.prepare('UPDATE team_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient=?').bind(new Date().toISOString(),body.id,recipient).run();
      return apiData({ok:true});
    }
    if(body.action==='subscribe') {
      if(!env.PUSH_VAPID_PUBLIC_KEY||!env.PUSH_VAPID_PRIVATE_KEY) return apiError('unavailable','Push is not configured yet. Your inbox still works.',503);
      return apiData(await saveSubscription(env,recipient,sessionId,body.subscription));
    }
    if(body.action==='unsubscribe'||body.action==='subscription-status') {
      if(typeof body.endpoint!=='string'||body.endpoint.length>2048)throw new NotificationError('A device endpoint is required.');
      const row=await env.TG_DATA.prepare('SELECT id,session_id FROM push_subscriptions WHERE endpoint=? AND recipient=?').bind(body.endpoint,recipient).first<{id:string;session_id:string}>();
      if(body.action==='subscription-status')return apiData({enabled:!!row&&row.session_id===sessionId});
      if(row)await env.TG_DATA.batch([
        env.TG_DATA.prepare('DELETE FROM notification_push_jobs WHERE subscription_id=?').bind(row.id),
        env.TG_DATA.prepare('DELETE FROM push_subscriptions WHERE id=? AND recipient=?').bind(row.id,recipient),
      ]);
      return apiData({enabled:false});
    }
    if(body.action==='test')return apiData(await sendNotification(env,{type:'user',id:recipient,name:session.name,email:recipient,scopes:new Set(['notifications:send'])},
      {requestId:body.requestId,recipients:[recipient],title:'Notifications are ready',body:'This is your test notification. Your team updates will be saved here, even when push is turned off.',href:'/app/inbox'}));
    throw new NotificationError('Unknown inbox action.');
  }catch(error){if(error instanceof NotificationError)return apiError('invalid_request',error.message,error.status);throw error;}
}
