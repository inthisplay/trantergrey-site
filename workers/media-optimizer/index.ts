import type { AdminEnvironment } from '../../functions/_lib/admin';

type Result = { response(): Response | Promise<Response> };
type Env = AdminEnvironment & {
 IMAGES: { input(stream: ReadableStream): { transform(options: object): { output(options: object): Promise<Result> } } };
 MEDIA: { input(stream: ReadableStream): { transform(options: object): { output(options: object): Result } } };
};
export const MONTHLY_LIMIT = 4500; // Shared image/poster attempts, including failures; never upgrade a plan.
export type Variant = 'thumb' | 'preview' | 'poster';
export const sourceQuery = `SELECT r2_key,content_type FROM rolodex_media WHERE r2_key=? AND kind='upload' AND deleted_at IS NULL
 UNION SELECT r2_key,content_type FROM production_gallery WHERE r2_key=? AND deleted_at IS NULL
 UNION SELECT r2_key,content_type FROM production_attachments WHERE r2_key=? AND status='stored' LIMIT 1`;

export async function optimize(env: Env, key: string, variant: Variant) {
 const source = await env.TG_DATA.prepare(sourceQuery).bind(key,key,key).first<{r2_key:string;content_type:string}>();
 if (!source) return { status:'missing' };
 const video=source.content_type.startsWith('video/');
 if (!(video ? variant==='poster' : source.content_type.startsWith('image/') && variant!=='poster')) return {status:'unsupported'};
 const now=new Date(), stamp=now.toISOString(), token=crypto.randomUUID();
 const existing=await env.TG_DATA.prepare('SELECT status,retry_at FROM media_previews WHERE source_key=? AND variant=?').bind(key,variant).first<{status:string;retry_at:string|null}>();
 if (existing?.status==='ready' || (existing?.retry_at && existing.retry_at>stamp)) return {status:existing.status};
 const lease=await env.TG_DATA.prepare(`INSERT INTO media_previews(source_key,variant,status,lease_token,retry_at,updated_at) VALUES(?,?,'processing',?,?,?)
 ON CONFLICT(source_key,variant) DO UPDATE SET status='processing',lease_token=excluded.lease_token,retry_at=excluded.retry_at,updated_at=excluded.updated_at
 WHERE media_previews.status<>'ready' AND (media_previews.retry_at IS NULL OR media_previews.retry_at<=excluded.updated_at) RETURNING lease_token`)
 .bind(key,variant,token,new Date(now.getTime()+10*60*1000).toISOString(),stamp).first();
 if (!lease) return {status:'processing'};
 try {
  const file=await env.PRODUCTION_ARCHIVE!.get(key);
  if (!file) throw new Error('Original missing from storage');
  if (file.size>(video?100:20)*1024*1024) throw new Error('Original exceeds Cloudflare transformation input limit');
  const budget=await env.TG_DATA.prepare(`INSERT INTO media_transform_budget(month,attempts) VALUES(?,1)
   ON CONFLICT(month) DO UPDATE SET attempts=attempts+1 WHERE attempts<? RETURNING attempts`).bind(stamp.slice(0,7),MONTHLY_LIMIT).first();
  if (!budget) {
   await env.TG_DATA.prepare("UPDATE media_previews SET status='deferred',error='Monthly free allowance safeguard',retry_at=?,updated_at=? WHERE source_key=? AND variant=? AND lease_token=?")
    .bind(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString(),stamp,key,variant,token).run();
   return {status:'deferred'};
  }
  const size=variant==='thumb'?480:variant==='poster'?640:1600;
  const response=video
   ? await env.MEDIA.input(file.body).transform({width:size,height:size,fit:'scale-down'}).output({mode:'frame',time:'0s',format:'jpg'}).response()
   : await (await env.IMAGES.input(file.body).transform({width:size,height:size,fit:'scale-down',anim:false}).output({format:'image/webp',quality:variant==='thumb'?78:84})).response();
  if (!response.ok) throw new Error(`Transformation returned ${response.status}: ${(await response.text()).slice(0,250)}`);
  const bytes=await response.arrayBuffer();
  const contentType=video?'image/jpeg':'image/webp';
  if (!bytes.byteLength) throw new Error('Transformation was empty');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  // Reuse an already smaller original image rather than increasing its size.
  const useOriginal=!video && bytes.byteLength>=file.size && source.content_type!=='image/heic';
  const outputKey=useOriginal?key:`media-previews/v1/${hash}/${variant}.${video?'jpg':'webp'}`;
  if (!useOriginal) await env.PRODUCTION_ARCHIVE!.put(outputKey,bytes,{httpMetadata:{contentType}});
  await env.TG_DATA.prepare("UPDATE media_previews SET status='ready',output_key=?,content_type=?,byte_size=?,source_bytes=?,retry_at=NULL,error=NULL,updated_at=? WHERE source_key=? AND variant=? AND lease_token=?")
   .bind(outputKey,useOriginal?source.content_type:contentType,useOriginal?file.size:bytes.byteLength,file.size,new Date().toISOString(),key,variant,token).run();
  return {status:'ready'};
 } catch(error) {
  const message=error instanceof Error?error.message:'Transformation failed';
  await env.TG_DATA.prepare("UPDATE media_previews SET status='failed',error=?,retry_at=?,updated_at=? WHERE source_key=? AND variant=? AND lease_token=?")
   .bind(message.slice(0,500),new Date(Date.now()+86400000).toISOString(),new Date().toISOString(),key,variant,token).run();
  return {status:'failed',error:message};
 }
}
export default {
 async fetch(request:Request,env:Env):Promise<Response> {
  // No public route or workers.dev endpoint; only a Pages service binding can call this Worker.
  if (request.method!=='POST') return new Response('Method not allowed',{status:405});
  const body=await request.json().catch(()=>null) as {key?:string;variant?:Variant}|null;
  if (!body?.key || !['thumb','preview','poster'].includes(body.variant||'')) return new Response('Invalid media',{status:400});
  return Response.json(await optimize(env,body.key,body.variant!));
 }
};
