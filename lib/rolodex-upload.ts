export const MAX_UPLOAD_BYTES = 90 * 1024 * 1024;
const types = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime']);
export function uploadContentType(file: Pick<File,'type'|'name'>) {
  return file.type || ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',avif:'image/avif',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'} as Record<string,string>)[file.name.split('.').pop()?.toLowerCase() || ''] || '';
}
export function uploadValidation(file: Pick<File,'size'|'name'|'type'>) {
  if (!file.size) return 'This file is empty. Choose a complete file.';
  if (file.size > MAX_UPLOAD_BYTES) return `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 90 MB; export a smaller copy and try again.`;
  if (!types.has(uploadContentType(file))) return 'Choose JPG, PNG, WebP, GIF, AVIF, MP4, WebM, or MOV.';
  return null;
}
export type UploadStage = { loaded:number; total:number; phase:'uploading'|'saving' };
export function uploadRolodexFile(personId:string,file:File,uploadId:string,onProgress:(stage:UploadStage)=>void,signal?:AbortSignal):Promise<{id:string}> {
 return new Promise((resolve,reject)=>{
  const invalid=uploadValidation(file);if(invalid){reject(new Error(invalid));return;}
  const xhr=new XMLHttpRequest();let settled=false;let timer:ReturnType<typeof setTimeout>;
  const finish=(error?:Error,result?:{id:string})=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(error)reject(error);else resolve(result!);};
  const stop=(message:string)=>{finish(new Error(message));xhr.abort();};
  const cancel=()=>stop('Upload canceled. If transfer had finished, check the profile before retrying.');
  const watchdog=(saving=false)=>{clearTimeout(timer);timer=setTimeout(()=>stop(saving?'The server has not confirmed this upload. Use Retry to safely check or restart this file.':'No upload progress for 60 seconds. Check your connection, then use Retry.'),saving?90_000:60_000);};
  xhr.open('POST',`/api/admin/rolodex/upload?id=${encodeURIComponent(personId)}`);
  xhr.timeout=10*60*1000;
  xhr.setRequestHeader('Content-Type',uploadContentType(file));xhr.setRequestHeader('X-File-Name',encodeURIComponent(file.name));xhr.setRequestHeader('X-File-Size',String(file.size));xhr.setRequestHeader('X-Upload-Id',uploadId);
  xhr.upload.onprogress=event=>{watchdog();onProgress({loaded:Math.min(event.loaded,file.size),total:file.size,phase:'uploading'});};
  xhr.upload.onload=()=>{watchdog(true);onProgress({loaded:file.size,total:file.size,phase:'saving'});};
  xhr.onerror=()=>finish(new Error('Connection lost. Use Retry to safely check or restart this file.'));
  xhr.ontimeout=()=>finish(new Error('Upload exceeded 10 minutes. Check your connection or export a smaller video, then use Retry.'));
  xhr.onabort=()=>finish(new Error('Upload canceled.'));
  xhr.onload=()=>{
   let data;try{data=JSON.parse(xhr.responseText);}catch{/* Cloudflare errors can be HTML. */}
   if(xhr.status>=200&&xhr.status<300&&typeof data?.id==='string')finish(undefined,data);
   else finish(new Error(xhr.status===401?'Your sign-in expired. Sign in again, then retry.':xhr.status===413?'The file exceeds the upload limit. Export a copy under 90 MB.':data?.error || `Upload could not be confirmed (HTTP ${xhr.status}). Use Retry to safely check or restart this file.`));
  };
  if(signal?.aborted){cancel();return;}signal?.addEventListener('abort',cancel,{once:true});
  watchdog();onProgress({loaded:0,total:file.size,phase:'uploading'});xhr.send(file);
 });
}
