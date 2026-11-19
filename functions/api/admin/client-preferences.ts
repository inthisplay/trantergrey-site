import { adminSession, type AdminEnvironment } from '../../_lib/admin';
import { normalizeColumnColor } from '../../../lib/deck-colors';

export async function onRequest({request,env}:{request:Request;env:AdminEnvironment}) {
 const headers = {'Cache-Control':'private, no-store'};
 const reply = (data:unknown,status=200)=>Response.json(data,{status,headers});
 const session = await adminSession(request,env);
 if(!session)return reply({error:'Sign in to customize clients.'},401);
 const email=session.email?.trim().toLowerCase();
 if(request.method==='GET') {
  if(!email)return reply({preferences:{},canCustomize:false});
  const {results}=await env.TG_DATA.prepare('SELECT client_id,pinned,color,sort_order FROM client_user_preferences WHERE user_email=?').bind(email).all<{client_id:string;pinned:number;color:string|null;sort_order:number|null}>();
  return reply({canCustomize:true,preferences:Object.fromEntries(results.map(row=>[row.client_id,{pinned:Boolean(row.pinned),color:row.color,...(row.sort_order===null?{}:{sortOrder:row.sort_order})}]))});
 }
 if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
 if(!email)return reply({error:'Sign in with your own Google account to customize clients.'},403);
 if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Invalid origin.'},403);
 const body=await request.json().catch(()=>null);
 if(body?.action==='reorder') {
  const ids=body.ids;
  if(Object.keys(body).some(key=>!['action','ids'].includes(key))||!Array.isArray(ids)||!ids.length||ids.length>1000||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)return reply({error:'Invalid client order.'},400);
  const {results}=await env.TG_DATA.prepare('SELECT id FROM client_directory').all<{id:string}>();
  const existing=new Set(results.map(row=>row.id));
  if(ids.some(id=>!existing.has(id)))return reply({error:'A client no longer exists. Refresh and try again.'},409);
  await env.TG_DATA.batch(ids.map((id,index)=>env.TG_DATA.prepare(`INSERT INTO client_user_preferences(user_email,client_id,sort_order) VALUES(?,?,?) ON CONFLICT(user_email,client_id) DO UPDATE SET sort_order=excluded.sort_order`).bind(email,id,index)));
  return reply({ok:true});
 }
 if(!body || typeof body.clientId!=='string' || !body.clientId ||
   Object.keys(body).some(key=>!['clientId','pinned','color'].includes(key)) ||
   (!('pinned' in body)&&!('color' in body)) ||
   ('pinned' in body&&typeof body.pinned!=='boolean') ||
   ('color' in body&&normalizeColumnColor(body.color)===undefined))return reply({error:'Choose a valid pin or card color.'},400);
 if(!await env.TG_DATA.prepare('SELECT id FROM client_directory WHERE id=?').bind(body.clientId).first())return reply({error:'Client not found.'},404);
 await env.TG_DATA.prepare(`INSERT INTO client_user_preferences(user_email,client_id,pinned,color) VALUES(?,?,?,?)
  ON CONFLICT(user_email,client_id) DO UPDATE SET
  pinned=CASE WHEN ? THEN excluded.pinned ELSE client_user_preferences.pinned END,
  color=CASE WHEN ? THEN excluded.color ELSE client_user_preferences.color END`).bind(email,body.clientId,body.pinned?1:0,normalizeColumnColor(body.color)??null,'pinned' in body?1:0,'color' in body?1:0).run();
 const row=await env.TG_DATA.prepare('SELECT pinned,color,sort_order FROM client_user_preferences WHERE user_email=? AND client_id=?').bind(email,body.clientId).first<{pinned:number;color:string|null;sort_order:number|null}>();
 return reply({pinned:Boolean(row?.pinned),color:row?.color??null,...(row?.sort_order==null?{}:{sortOrder:row.sort_order})});
}
