import type { AdminEnvironment } from './admin';
import { driveToken, driveRequest, requireWithin, folderType } from './client-drive';
import { sharedDriveId, encryptDriveSecret, decryptDriveSecret } from './client-drive-oauth';
import { drivePreviewResponse } from './client-drive-preview';
import { getMuxLibraryAssets, getMuxLibraryAsset, muxFetch, invalidateMuxLibraryCache } from './mux';
import { invalidateMuxBrowseIndex } from './mux-library';
import { matchArchive, type ArchiveVideo, type ArchiveFile, type ArchiveLink, type ArchiveJob, type ArchiveRow } from '../../lib/video-archive';

export const archiveRoot = '16EY5UTL4l5D26IyXHzFaplSkdqVTbUli';
const now = () => new Date().toISOString();
type State = { active_scan: string | null; pending_scan: string | null; scan_status: string; checked_at: string | null; error: string | null; worker_seen_at: string | null };
type Job = ArchiveJob & { upload_id: string | null; upload_cipher: string | null; source_version: string | null; failures: number; next_attempt_at: string | null };
export const archiveState = (env: AdminEnvironment) => env.TG_DATA.prepare("SELECT * FROM archive_state WHERE id='archive'").first<State>();
export async function archiveCatalog(env: AdminEnvironment) {
  const state = await archiveState(env);
  const [videos, files, links, jobs] = await Promise.all([
    env.TG_DATA.prepare('SELECT * FROM archive_videos ORDER BY created_at DESC,title').all<ArchiveVideo & {archive_client:string|null}>(),
    env.TG_DATA.prepare('SELECT value FROM archive_files WHERE scan_id=?').bind(state?.active_scan || '').all<{value:string}>(),
    env.TG_DATA.prepare('SELECT * FROM archive_links').all<ArchiveLink>(),
    env.TG_DATA.prepare('SELECT id,vimeo_id,file_id,title,client,state,asset_id,bytes_done,byte_size,error FROM archive_imports').all<ArchiveJob>(),
  ]);
  const matches = matchArchive(videos.results.map(video=>({...video,client:video.archive_client ?? video.client})), files.results.map(row => JSON.parse(row.value)), links.results);
  return { state, matches, jobs: jobs.results };
}
export async function archiveRows(env: AdminEnvironment) {
  const {state,matches,jobs}=await archiveCatalog(env);
  // A local snapshot provides immediate links; import preflight checks the live Mux account again.
  const rows=await env.TG_DATA.prepare('SELECT value FROM mux_library_assets WHERE refresh_id=(SELECT refresh_id FROM mux_library_snapshot_state WHERE id=?)').bind('library').all<{value:string}>();
  const mux=new Map<string,string>();
  for(const row of rows.results){const asset=JSON.parse(row.value);if(asset.vimeoId && asset.status!=='errored')mux.set(asset.vimeoId,asset.id);}
  const byVideo=new Map(jobs.map(job=>[job.vimeo_id,job]));
  return {state, rows:matches.map(match=>({id:match.video.vimeo_id,title:match.video.title,client:match.video.client,uploadDate:match.video.created_at,folder:match.file?.path ?? match.video.folder,duration:match.video.duration,status:match.status,basis:match.basis,file:match.file,candidates:match.candidates,job:byVideo.get(match.video.vimeo_id)||null,muxAssetId:mux.get(match.video.vimeo_id)||null} satisfies ArchiveRow))};
}
export async function startArchiveScan(env: AdminEnvironment) {
  const token=await driveToken(env);
  const root=await requireWithin(token,archiveRoot,sharedDriveId(env));
  if(root.mimeType!==folderType)throw new Error('The archive root is not a folder.');
  const state=await archiveState(env);
  if(state?.scan_status==='scanning')return;
  if(state?.pending_scan && state.scan_status==='error') {
    await env.TG_DATA.prepare("UPDATE archive_state SET scan_status='scanning',error=NULL WHERE id='archive'").run();return;
  }
  const id=crypto.randomUUID();
  await env.TG_DATA.batch([
    env.TG_DATA.prepare('INSERT INTO archive_scan_folders(scan_id,folder_id,path) VALUES(?,?,?)').bind(id,archiveRoot,''),
    env.TG_DATA.prepare("UPDATE archive_state SET pending_scan=?,scan_status='scanning',error=NULL WHERE id='archive'").bind(id),
  ]);
}
async function scanStep(env: AdminEnvironment,state: State) {
  const scan=state.pending_scan!;
  const folder=await env.TG_DATA.prepare('SELECT folder_id,path,page_token FROM archive_scan_folders WHERE scan_id=? AND done=0 ORDER BY path LIMIT 1').bind(scan).first<{folder_id:string;path:string;page_token:string}>();
  if(!folder) {
    const [videos,files,links]=await Promise.all([
      env.TG_DATA.prepare('SELECT * FROM archive_videos').all<ArchiveVideo>(),
      env.TG_DATA.prepare('SELECT value FROM archive_files WHERE scan_id=?').bind(scan).all<{value:string}>(),
      env.TG_DATA.prepare('SELECT * FROM archive_links').all<ArchiveLink>(),
    ]);
    const matched=matchArchive(videos.results,files.results.map(row=>JSON.parse(row.value)),links.results).filter(m=>m.file && ['available','restricted'].includes(m.status));
    for(let i=0;i<matched.length;i+=50)await env.TG_DATA.batch(matched.slice(i,i+50).map(m=>env.TG_DATA.prepare('INSERT INTO archive_links(vimeo_id,file_id,updated_at) VALUES(?,?,?) ON CONFLICT(vimeo_id) DO NOTHING').bind(m.video.vimeo_id,m.file!.id,now())));
    await env.TG_DATA.prepare("UPDATE archive_state SET active_scan=?,pending_scan=NULL,scan_status='complete',checked_at=?,error=NULL WHERE id='archive'").bind(scan,now()).run();
    await env.TG_DATA.batch([env.TG_DATA.prepare('DELETE FROM archive_files WHERE scan_id<>?').bind(scan),env.TG_DATA.prepare('DELETE FROM archive_scan_folders WHERE scan_id<>?').bind(scan)]);
    return;
  }
  const token=await driveToken(env);
  // Revalidate ancestry on each page: moving a folder mid-scan cannot expand the archive scope.
  await requireWithin(token,folder.folder_id,archiveRoot);
  const params=new URLSearchParams({q:`'${folder.folder_id}' in parents and trashed=false`,corpora:'drive',driveId:sharedDriveId(env),supportsAllDrives:'true',includeItemsFromAllDrives:'true',pageSize:'100',fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,size,version,capabilities(canDownload),videoMediaMetadata(durationMillis))'});
  if(folder.page_token)params.set('pageToken',folder.page_token);
  const page=await driveRequest<{files:ArchiveFile[];nextPageToken?:string;incompleteSearch?:boolean}>(token,`files?${params}`);
  if(page.incompleteSearch)throw new Error('Google returned an incomplete scan. Refresh archive to retry.');
  const statements=[];
  for(const file of page.files) {
    if(file.mimeType===folderType)statements.push(env.TG_DATA.prepare('INSERT OR IGNORE INTO archive_scan_folders(scan_id,folder_id,path) VALUES(?,?,?)').bind(scan,file.id,[folder.path,file.name].filter(Boolean).join(' / ')));
    else if(file.mimeType.startsWith('video/') || /\.(mp4|mov|m4v|webm|mxf|avi|mkv|mpeg|mpg)$/i.test(file.name))statements.push(env.TG_DATA.prepare('INSERT INTO archive_files(scan_id,file_id,value) VALUES(?,?,?) ON CONFLICT(scan_id,file_id) DO UPDATE SET value=excluded.value').bind(scan,file.id,JSON.stringify({...file,path:folder.path})));
  }
  for(let i=0;i<statements.length;i+=50)await env.TG_DATA.batch(statements.slice(i,i+50));
  await env.TG_DATA.prepare('UPDATE archive_scan_folders SET page_token=?,done=? WHERE scan_id=? AND folder_id=?').bind(page.nextPageToken||'',page.nextPageToken?0:1,scan,folder.folder_id).run();
}
async function verifiedFile(env:AdminEnvironment,id:string) {
  const token=await driveToken(env);
  const file=await requireWithin(token,id,archiveRoot);
  if(file.capabilities?.canDownload===false)throw new Error('The connected Drive account cannot download this video.');
  if(!file.mimeType.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mxf|avi|mkv|mpeg|mpg)$/i.test(file.name))throw new Error('Choose a video file.');
  const details=await driveRequest<ArchiveFile>(token,`files/${id}?supportsAllDrives=true&fields=id,name,mimeType,size,version,capabilities(canDownload)`);
  return {token,file:{...file,...details}};
}
export async function archivePreview(request:Request,env:AdminEnvironment,id:string) {
  const {matches}=await archiveCatalog(env);const match=matches.find(m=>m.video.vimeo_id===id);
  if(!match?.file)throw new Error('Verify this video’s Drive match before previewing.');
  const {token,file}=await verifiedFile(env,match.file.id);
  return drivePreviewResponse(request,token,file);
}
export async function linkArchiveFile(env:AdminEnvironment,id:string,fileId:string) {
  const {matches}=await archiveCatalog(env);const match=matches.find(m=>m.video.vimeo_id===id);
  if(!match)throw new Error('Archive video not found.');
  if(!/^[\w-]+$/.test(fileId))throw new Error('Enter a valid Drive file ID.');
  await verifiedFile(env,fileId);
  const state=await archiveState(env);
  if(!await env.TG_DATA.prepare('SELECT file_id FROM archive_files WHERE scan_id=? AND file_id=?').bind(state?.active_scan,fileId).first())throw new Error('Refresh archive first so this file can be verified in the current catalog.');
  const claimed=await env.TG_DATA.prepare('SELECT vimeo_id FROM archive_links WHERE file_id=? AND vimeo_id<>?').bind(fileId,id).first();
  if(claimed)throw new Error('This file is already linked to another Vimeo record.');
  await env.TG_DATA.prepare('INSERT INTO archive_links(vimeo_id,file_id,manual,updated_at) VALUES(?,?,1,?) ON CONFLICT(vimeo_id) DO UPDATE SET file_id=excluded.file_id,manual=1,updated_at=excluded.updated_at').bind(id,fileId,now()).run();
}
export async function queueArchiveImport(env:AdminEnvironment,id:string,title:string,client:string,actor:string) {
  if(!title.trim()||title.length>240||client.length>120)throw new Error('Enter a title and a valid client name.');
  if(client && !await env.TG_DATA.prepare('SELECT name FROM client_directory WHERE name=?').bind(client).first())throw new Error('Choose a client from the main directory, or leave it unassigned.');
  const existing=await env.TG_DATA.prepare('SELECT id FROM archive_imports WHERE vimeo_id=?').bind(id).first<{id:string}>();
  if(existing)return existing.id;
  const {matches}=await archiveCatalog(env);const match=matches.find(m=>m.video.vimeo_id===id);
  if(match?.status!=='available'||!match.file)throw new Error('Verify the Drive file before importing.');
  const {file}=await verifiedFile(env,match.file.id);
  const size=Number(file.size);if(!Number.isSafeInteger(size)||size<=0)throw new Error('The file size is unavailable. Try again after the transfer finishes.');
  const jobId=crypto.randomUUID();
  await env.TG_DATA.prepare('INSERT INTO archive_imports(id,vimeo_id,file_id,title,client,byte_size,source_version,requested_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(jobId,id,file.id,title.trim(),client.trim(),size,file.version||null,actor,now(),now()).run();
  const job=await env.TG_DATA.prepare('SELECT id FROM archive_imports WHERE vimeo_id=? OR file_id=?').bind(id,file.id).first<{id:string}>();
  return job!.id;
}
type Upload = {id:string;url:string;status:string;asset_id?:string};
async function finishImport(env:AdminEnvironment,job:Job,assetId:string) {
  const asset=await getMuxLibraryAsset(env,assetId);
  if(asset.status==='errored')throw new Error('Mux could not process this video. Review the asset in Mux before retrying.');
  if(asset.status!=='ready'){await env.TG_DATA.prepare("UPDATE archive_imports SET asset_id=?,state='processing',next_attempt_at=? WHERE id=?").bind(assetId,new Date(Date.now()+15000).toISOString(),job.id).run();return;}
  // An explicit unpublished override prevents historical Vimeo publication from exposing this in Our Work.
  if(job.upload_id)await env.TG_DATA.prepare("INSERT INTO mux_asset_metadata(asset_id,title,client,tags,status,updated_at) SELECT ?,?,?,tags,'unreviewed',? FROM archive_videos WHERE vimeo_id=? ON CONFLICT(asset_id) DO NOTHING").bind(assetId,job.title,job.client||null,now(),job.vimeo_id).run();
  await invalidateMuxLibraryCache(env);await invalidateMuxBrowseIndex(env);
  await env.TG_DATA.prepare("UPDATE archive_imports SET asset_id=?,state='ready',upload_cipher=NULL,error=NULL,updated_at=?,bytes_done=byte_size WHERE id=?").bind(assetId,now(),job.id).run();
}
async function importStep(env:AdminEnvironment,job:Job) {
  if(job.asset_id)return finishImport(env,job,job.asset_id);
  if(!job.upload_id) {
    // Do this once per job, against live Mux data, before creating any upload.
    const assets=await getMuxLibraryAssets(env,{forceRefresh:true});
    const existing=assets.filter(asset=>asset.vimeoId===job.vimeo_id && asset.status!=='errored');
    if(existing.length>1)throw new Error('More than one Mux asset already has this Vimeo ID. Review the library before importing.');
    if(existing.length===1){await env.TG_DATA.prepare('UPDATE archive_imports SET asset_id=?,state=?,updated_at=? WHERE id=?').bind(existing[0].id,existing[0].status==='ready'?'ready':'processing',now(),job.id).run();return;}
    const {file}=await verifiedFile(env,job.file_id);
    if(Number(file.size)!==job.byte_size || job.source_version && file.version!==job.source_version)throw new Error('The Drive file changed after import was requested. Verify the source before retrying.');
    const upload=await muxFetch<Upload>(env,'uploads',{method:'POST',body:JSON.stringify({timeout:604800,new_asset_settings:{playback_policies:['public'],video_quality:'plus',meta:{title:job.title,external_id:job.vimeo_id},passthrough:`archive:${job.id}`}})});
    if(!upload?.id||!upload.url)throw new Error('Mux did not return an upload.');
    await env.TG_DATA.prepare("UPDATE archive_imports SET upload_id=?,upload_cipher=?,state='transferring',updated_at=? WHERE id=?").bind(upload.id,await encryptDriveSecret(env,upload.url),now(),job.id).run();return;
  }
  const upload=await muxFetch<Upload>(env,`uploads/${job.upload_id}`);
  if(!upload)throw new Error('Mux upload unavailable.');
  if(upload.asset_id)return finishImport(env,job,upload.asset_id);
  if(['timed_out','cancelled','errored'].includes(upload.status))throw new Error(`Mux upload ${upload.status}. Check the upload before starting a replacement.`);
  const {token,file}=await verifiedFile(env,job.file_id);
  if(Number(file.size)!==job.byte_size || job.source_version && file.version!==job.source_version)throw new Error('The Drive file changed during transfer. Import stopped to avoid mixing versions.');
  const url=await decryptDriveSecret(env,job.upload_cipher!);
  const parsed=new URL(url);if(parsed.protocol!=='https:' || !(parsed.hostname.endsWith('.googleapis.com')||parsed.hostname.endsWith('.mux.com')||parsed.hostname.endsWith('.googleusercontent.com')))throw new Error('Unexpected Mux upload host.');
  // Query the receiver before each chunk, including after a lost response or worker restart.
  const probe=await fetch(url,{method:'PUT',headers:{'Content-Range':`bytes */${job.byte_size}`},body:new Uint8Array(0),redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(probe.ok){await probe.body?.cancel();await env.TG_DATA.prepare("UPDATE archive_imports SET state='processing',bytes_done=byte_size,next_attempt_at=? WHERE id=?").bind(new Date(Date.now()+15000).toISOString(),job.id).run();return;}
  if(probe.status!==308){await probe.body?.cancel();throw new Error('Could not verify the resumable upload position. Retry safely.');}
  const range=probe.headers.get('range');await probe.body?.cancel();
  const acknowledged=range?.match(/^bytes=0-(\d+)$/i);
  if(range&&!acknowledged)throw new Error('Unexpected upload acknowledgement.');
  const start=acknowledged?Number(acknowledged[1])+1:0;
  if(start>=job.byte_size)throw new Error('Waiting for Mux to finalize the upload.');
  const end=Math.min(start+4*1024*1024,job.byte_size)-1;
  const source=await fetch(`https://www.googleapis.com/drive/v3/files/${job.file_id}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${token}`,Range:`bytes=${start}-${end}`},redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(source.status!==206 || source.headers.get('content-range')!==`bytes ${start}-${end}/${job.byte_size}`){await source.body?.cancel();throw new Error('Drive did not return the requested file range.');}
  // Bound memory even if an upstream server ignores its declared range.
  const reader=source.body!.getReader(), bytes=new Uint8Array(end-start+1);let count=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;if(count+chunk.value.length>bytes.length){await reader.cancel();throw new Error('Drive returned too much data.');}bytes.set(chunk.value,count);count+=chunk.value.length;}
  if(count!==bytes.length)throw new Error('Incomplete Drive download.');
  const sent=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/octet-stream','Content-Range':`bytes ${start}-${end}/${job.byte_size}`},body:bytes,redirect:'manual',signal:AbortSignal.timeout(20000)});
  const ok=sent.ok||sent.status===308;await sent.body?.cancel();if(!ok)throw new Error('Mux could not accept this chunk. Retry will check the saved position.');
  await env.TG_DATA.prepare("UPDATE archive_imports SET bytes_done=?,state=?,failures=0,error=NULL,next_attempt_at=NULL,updated_at=? WHERE id=?").bind(end+1,end+1===job.byte_size?'processing':'transferring',now(),job.id).run();
}

export async function archiveWorkerStep(env:AdminEnvironment) {
  const owner=crypto.randomUUID();const timestamp=now();
  const lease=await env.TG_DATA.prepare("UPDATE archive_state SET lease_owner=?,lease_until=?,worker_seen_at=? WHERE id='archive' AND (lease_until IS NULL OR lease_until<?) RETURNING id").bind(owner,new Date(Date.now()+120000).toISOString(),timestamp,timestamp).first();
  if(!lease)return {busy:true};
  let worked=false;
  try {
    const state=await archiveState(env);
    if(state?.pending_scan && state.scan_status==='scanning') {
      worked=true;
      try{await scanStep(env,state);}catch(e){await env.TG_DATA.prepare("UPDATE archive_state SET scan_status='error',error=? WHERE id='archive'").bind(e instanceof Error?e.message:'Drive scan failed.').run();}
    }
    const job=await env.TG_DATA.prepare("SELECT * FROM archive_imports WHERE state IN ('queued','transferring','processing') AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY updated_at LIMIT 1").bind(now()).first<Job>();
    if(job){worked=true;try{await importStep(env,job);}catch(e){const failures=job.failures+1;await env.TG_DATA.prepare('UPDATE archive_imports SET failures=?,state=?,error=?,next_attempt_at=?,updated_at=? WHERE id=?').bind(failures,failures>=3?'failed':job.state,e instanceof Error?e.message:'Import failed.',new Date(Date.now()+Math.min(60000,failures*10000)).toISOString(),now(),job.id).run();}}
    return {worked};
  }finally{await env.TG_DATA.prepare("UPDATE archive_state SET lease_owner=NULL,lease_until=NULL,worker_seen_at=? WHERE id='archive' AND lease_owner=?").bind(now(),owner).run();}
}
