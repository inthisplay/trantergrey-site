import type { DriveFile } from './client-drive';

const pdfExports = new Set(['document', 'spreadsheet', 'presentation', 'drawing'].map(type => `application/vnd.google-apps.${type}`));
const images = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif','image/bmp']);
const videos = new Set(['video/mp4','video/webm','video/quicktime']);
const audio = new Set(['audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/ogg','audio/webm','audio/aac']);
export function drivePreviewInfo(file: DriveFile) {
 const exported = pdfExports.has(file.mimeType);
 const mimeType = exported ? 'application/pdf' : file.mimeType;
 const kind = mimeType === 'application/pdf' ? 'pdf' : images.has(mimeType) ? 'image' : videos.has(mimeType) ? 'video' : audio.has(mimeType) ? 'audio' : ['text/plain','text/csv','application/json'].includes(mimeType) && Number(file.size || 0) <= 2*1024*1024 ? 'text' : 'unsupported';
 return { canTrash: file.capabilities?.canTrash === true && !['application/vnd.google-apps.folder','application/vnd.google-apps.shortcut'].includes(file.mimeType), version: file.version, originalName: file.name, kind, mimeType, name: exported ? `${file.name}.pdf` : file.name, exported, downloadable: file.capabilities?.canDownload !== false && (!file.mimeType.startsWith('application/vnd.google-apps.') || exported) };
}
export async function drivePreviewResponse(request: Request, token: string, file: DriveFile) {
 const info = drivePreviewInfo(file);
 const headers = new Headers({'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'Cross-Origin-Resource-Policy':'same-origin', 'Content-Security-Policy':"default-src 'none'; sandbox; frame-ancestors 'self'"});
 const fail = (error:string,status:number) => Response.json({error},{status,headers});
 if(!info.downloadable)return fail('This file cannot be downloaded through the connected Drive account. Open it in Drive.',403);
 const download = new URL(request.url).searchParams.get('download') === '1';
 if(info.kind === 'unsupported' && !download)return fail('This format cannot be previewed here. Download it or open it in Drive.',415);
 const range=request.headers.get('range');
 if(range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))return fail('Invalid byte range.',416);
 const url = info.exported ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=application%2Fpdf` : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
 // Workers supports only follow/manual. Never follow redirects with the Drive token;
 // a redirect is handled by the non-success response below.
 const upstream = await fetch(url,{headers:{Authorization:`Bearer ${token}`,...(!info.exported && range ? {Range:range} : {})},redirect:'manual'});
 if(upstream.status===416){const contentRange=upstream.headers.get('content-range');if(contentRange)headers.set('Content-Range',contentRange);await upstream.body?.cancel();return new Response(null,{status:416,headers});}
 if(!upstream.ok){await upstream.body?.cancel();return fail(info.exported?'Google could not export this file as a PDF. Exports are limited to 10 MB; open it in Drive.':'Google could not load this file. Check its download permissions or try again.',upstream.status===403?403:502);}
 headers.set('Content-Type',info.kind==='unsupported'?'application/octet-stream':info.kind==='text'?'text/plain; charset=utf-8':info.mimeType);
 headers.set('Content-Disposition',`${download?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(info.name)}`);
 for(const name of ['Content-Length','Content-Range','Accept-Ranges']){const value=upstream.headers.get(name);if(value)headers.set(name,value);}
 return new Response(upstream.body,{status:upstream.status,headers});
}
