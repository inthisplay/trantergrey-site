import { editArchiveClients, undoArchiveClients } from '../../_lib/archive-clients';
import { adminResponse, adminSession, type AdminEnvironment } from '../../_lib/admin';
import { archiveRows, archiveState, startArchiveScan, archivePreview, linkArchiveFile, queueArchiveImport } from '../../_lib/video-archive';

const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});
export async function onRequest({request,env}:{request:Request;env:AdminEnvironment}) {
  const denied=await adminResponse(request,env);if(denied)return denied;
  const url=new URL(request.url);
  if(request.method!=='GET' && request.headers.get('origin')!==url.origin)return json({error:'Invalid request origin.'},403);
  try {
    if(request.method==='GET') {
      if(url.searchParams.has('preview'))return await archivePreview(request,env,url.searchParams.get('preview')!);
      const {rows,state}=await archiveRows(env);
      const scanProgress=state?.pending_scan ? await env.TG_DATA.prepare('SELECT COUNT(*) AS folders,COALESCE(SUM(done),0) AS done FROM archive_scan_folders WHERE scan_id=?').bind(state.pending_scan).first<{folders:number;done:number}>() : null;
      const query=(url.searchParams.get('q')||'').trim().toLocaleLowerCase();
      const client=url.searchParams.get('client')||'',year=url.searchParams.get('year')||'';
      const showUnavailable=url.searchParams.get('unavailable')==='1';
      const filtered=rows.filter(row=>(showUnavailable||row.status==='available')&&(!client||row.client===client)&&(!year||row.uploadDate.slice(0,4)===year)&&(!query||`${row.title} ${row.folder} ${row.client} ${row.id}`.toLocaleLowerCase().includes(query)));
      const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
      const publicState=state?{scan_status:state.scan_status,checked_at:state.checked_at,error:state.error,worker_seen_at:state.worker_seen_at,active_scan:state.active_scan,scanProgress}:null;
      const directory=await env.TG_DATA.prepare('SELECT name FROM client_directory ORDER BY name COLLATE NOCASE').all<{name:string}>();
      const actor=(await adminSession(request,env))!;
      const lastEdit=await env.TG_DATA.prepare('SELECT id,label,json_array_length(previous) AS count FROM archive_client_edits WHERE actor=? AND undone=0 AND json_array_length(previous)>0 ORDER BY created_at DESC,rowid DESC LIMIT 1').bind(actor.email||actor.name).first();
      return json({clientCounts:Object.fromEntries([...new Set(rows.map(row=>row.client))].map(label=>[label,rows.filter(row=>row.client===label).length])),matchingIds:filtered.map(row=>row.id),directoryClients:directory.results.map(row=>row.name),lastEdit,rows:filtered.slice(offset,offset+50),total:filtered.length,catalogTotal:rows.length,available:rows.filter(row=>row.status==='available').length,nextOffset:offset+50<filtered.length?offset+50:null,state:publicState,clients:[...new Set(rows.map(row=>row.client).filter(Boolean))].sort(),years:[...new Set(rows.map(row=>row.uploadDate.slice(0,4)))].sort().reverse()});
    }
    if(request.method!=='POST')return json({error:'Method not allowed.'},405);
    const body=await request.json() as {action?:string;id?:string;fileId?:string;title?:string;client?:string;ids?:string[];label?:string;editId?:string;source?:string;sources?:string[]};
    if(['assign-clients','rename-client','undo-clients'].includes(body.action||'')){
      const actor=(await adminSession(request,env))!;const who=actor.email||actor.name;
      if(body.action==='undo-clients')return json(await undoArchiveClients(env,body.editId||'',who));
      let ids=body.ids||[];
      if(body.action==='rename-client'){
        const sources=body.sources ?? (body.source?[body.source]:[]);
        if(!Array.isArray(sources)||!sources.length||sources.length>10000||sources.some(value=>typeof value!=='string'||!value.trim())||typeof body.label!=='string'||!body.label.trim())throw new Error('Choose archive labels and a destination name.');
        const records=await env.TG_DATA.prepare('SELECT vimeo_id FROM archive_videos WHERE COALESCE(archive_client,client) IN (SELECT value FROM json_each(?))').bind(JSON.stringify(sources)).all<{vimeo_id:string}>();ids=records.results.map(row=>row.vimeo_id);
      }
      return json(await editArchiveClients(env,ids,body.label??'',who));
    }
    if(body.action==='scan'){await startArchiveScan(env);return json({ok:true});}
    if(typeof body.id!=='string'||!/^\d{5,20}$/.test(body.id))return json({error:'Choose an archive video.'},400);
    if(body.action==='link' && typeof body.fileId==='string'){await linkArchiveFile(env,body.id,body.fileId);return json({ok:true});}
    if(body.action==='import'){
      const state=await archiveState(env);
      if(!state?.worker_seen_at || Date.now()-Date.parse(state.worker_seen_at)>180000)return json({error:'The archive worker is offline. Start it before importing.'},503);
      const actor=(await adminSession(request,env))!;
      const id=await queueArchiveImport(env,body.id,body.title||'',body.client||'',actor.email||actor.name);return json({id},202);
    }
    if(body.action==='retry'){
      await env.TG_DATA.prepare("UPDATE archive_imports SET state=CASE WHEN asset_id IS NOT NULL THEN 'processing' WHEN upload_id IS NOT NULL THEN 'transferring' ELSE 'queued' END,failures=0,error=NULL,next_attempt_at=NULL WHERE vimeo_id=? AND state='failed'").bind(body.id).run();return json({ok:true});
    }
    return json({error:'Unknown archive action.'},400);
  }catch(e){return json({error:e instanceof Error?e.message:'Archive request failed.'},400);}
}
