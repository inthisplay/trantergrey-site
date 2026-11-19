import { prepareMediaPreviews } from '../../../_lib/media-previews';
import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
export async function onRequestPost({request,env}: {request:Request;env:AdminEnvironment}) {
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
 const reader=request.body?.getReader(); if(!reader)return fail('Choose a file.');
 const buffer=new Uint8Array(size);let bytes=0;
 while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>size){await reader.cancel();return fail('Upload exceeds declared size.',413);}buffer.set(chunk.value,bytes-chunk.value.byteLength);}
 if(bytes!==size)return fail('Upload was incomplete. Please retry.');
 const mediaId=crypto.randomUUID(),key=`rolodex/${id}/${mediaId}`,now=new Date().toISOString();
 await env.PRODUCTION_ARCHIVE.put(key,buffer,{httpMetadata:{contentType}});
 await env.TG_DATA.batch([
 env.TG_DATA.prepare(`INSERT INTO rolodex_media(id,person_id,title,kind,filename,content_type,byte_size,r2_key,created_at) VALUES(?,?,?,'upload',?,?,?,?,?)`).bind(mediaId,id,filename.replace(/\.[^.]+$/,'')||filename,filename,contentType,size,key,now),
 env.TG_DATA.prepare('UPDATE rolodex_people SET cover_media_id=COALESCE(cover_media_id,?),updated_at=? WHERE id=?').bind(mediaId,now,id)
 ]);
 await prepareMediaPreviews(env, key, contentType);
 return Response.json({id:mediaId},{status:201});
}
