import { prepareMediaPreviews } from '../../../_lib/media-previews';
import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
declare const FixedLengthStream: { new(size:number): { readable:ReadableStream; writable:WritableStream } };
export async function onRequestPost(context: {request:Request;env:AdminEnvironment;waitUntil?:(promise:Promise<unknown>)=>void}) {
 const {request,env}=context;
 const denied=await adminResponse(request,env); if(denied)return denied;
 const fail=(error:string,status=400)=>Response.json({error},{status});
 if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin)return fail('Invalid request origin.',403);
 const id=new URL(request.url).searchParams.get('id');
 if(!id || !await env.TG_DATA.prepare('SELECT id FROM rolodex_people WHERE id=? AND deleted_at IS NULL').bind(id).first())return fail('Person not found.',404);
 if(!env.PRODUCTION_ARCHIVE)return fail('Media storage is unavailable.',503);
 const contentType=(request.headers.get('content-type') || '').split(';')[0].toLowerCase();
 if(!['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime'].includes(contentType))return fail('Choose JPG, PNG, WebP, GIF, AVIF, MP4, WebM, or MOV.',415);
 const size=Number(request.headers.get('x-file-size'));
 if(!Number.isInteger(size)||size<1||size>90*1024*1024)return fail('Maximum file size is 90 MB.',413);
 let filename; try{filename=decodeURIComponent(request.headers.get('x-file-name')||'Media').replace(/[\\/\0]/g,'-').slice(0,180);}catch{return fail('Invalid filename.');}
 if(!request.body)return fail('Choose a file.');
 const suppliedId=request.headers.get('x-upload-id');
 if(suppliedId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedId))return fail('Invalid upload identifier. Choose the file again.');
 const mediaId=suppliedId||crypto.randomUUID(),key=`rolodex/${id}/${mediaId}`,now=new Date().toISOString();
 const existing=await env.TG_DATA.prepare('SELECT person_id,filename,byte_size,content_type,deleted_at FROM rolodex_media WHERE id=?').bind(mediaId).first<{person_id:string;filename:string;byte_size:number;content_type:string;deleted_at:string|null}>();
 if(existing){
  if(existing.person_id!==id||existing.filename!==filename||existing.byte_size!==size||existing.content_type!==contentType||existing.deleted_at)return fail('This upload identifier is already in use. Choose the file again.',409);
  return Response.json({id:mediaId,message:'Already uploaded successfully.'});
 }
 // FixedLengthStream checks truncation/overflow while streaming directly to storage,
 // avoiding a 90 MB allocation (and copies) inside a 128 MB Worker.
 const stream=new FixedLengthStream(size);
 const transferAbort=new AbortController();
 try {
  await Promise.all([request.body.pipeTo(stream.writable,{signal:transferAbort.signal}),env.PRODUCTION_ARCHIVE.put(key,stream.readable,{httpMetadata:{contentType}})]);
 } catch(error) {
  transferAbort.abort();
  console.error('Rolodex upload transfer failed', {mediaId,error});
  return fail('The file could not be stored completely. Check your connection and retry this upload.',503);
 }
 try {
 await env.TG_DATA.batch([
 env.TG_DATA.prepare(`INSERT OR IGNORE INTO rolodex_media(id,person_id,title,kind,filename,content_type,byte_size,r2_key,created_at) VALUES(?,?,?,'upload',?,?,?,?,?)`).bind(mediaId,id,filename.replace(/\.[^.]+$/,'')||filename,filename,contentType,size,key,now),
 env.TG_DATA.prepare('UPDATE rolodex_people SET cover_media_id=COALESCE(cover_media_id,?),updated_at=? WHERE id=?').bind(mediaId,now,id)
 ]);
 } catch(error) {
  console.error('Rolodex upload record failed', {mediaId,error});
  return fail('The file reached storage, but the profile could not be updated. Retry this upload to finish saving it.',503);
 }
 // Preview work must not hold the successful upload response open.
 if(context.waitUntil)context.waitUntil(prepareMediaPreviews(env, key, contentType));
 return Response.json({id:mediaId,message:'Uploaded successfully. A preview may take a moment to appear.'},{status:201});
}
