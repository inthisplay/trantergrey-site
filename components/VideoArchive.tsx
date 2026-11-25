'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ArchiveRow } from '@/lib/video-archive';
import styles from './VideoArchive.module.css';

type Catalog = {revision:string;activeJobs:number;matchingIds:string[];clientCounts:Record<string,number>;directoryClients:string[];lastEdit:{id:string;label:string;count:number}|null;rows:ArchiveRow[];total:number;catalogTotal:number;available:number;nextOffset:number|null;clients:string[];years:string[];state:{scan_status:string;checked_at:string|null;error:string|null;worker_seen_at:string|null;active_scan:string|null;scanProgress:{folders:number;done:number}|null}|null};
const date=(value:string)=>new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(value));
const availability=(row:ArchiveRow)=>row.status==='available'?'In Drive':row.status==='ambiguous'?'Needs review':row.status==='restricted'?'Download restricted':'Not found yet';
const folder=(row:ArchiveRow)=>`Vimeo Archive${row.folder?' / '+row.folder:''}`;

export function VideoArchive({onClose,onImported}:{onClose:()=>void;onImported:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[client,setClient]=useState(''),[year,setYear]=useState('');
  const [unavailable,setUnavailable]=useState(false),[offset,setOffset]=useState(0);
  const [catalog,setCatalog]=useState<Catalog|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [selected,setSelected]=useState<ArchiveRow|null>(null),[title,setTitle]=useState(''),[assignedClient,setAssignedClient]=useState(''),[fileId,setFileId]=useState(''),[previewError,setPreviewError]=useState(false);
  const [editing,setEditing]=useState(false),[checked,setChecked]=useState<string[]>([]),[bulkLabel,setBulkLabel]=useState(''),[manage,setManage]=useState(false),[sourceLabels,setSourceLabels]=useState<string[]>([]),[labelSearch,setLabelSearch]=useState(''),[targetLabel,setTargetLabel]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{setChecked([]);},[query,client,year,unavailable]);
  const catalogKey=useRef('');
  const currentCatalog=useRef<Catalog|null>(null),activeLoad=useRef<AbortController|null>(null);
  currentCatalog.current=catalog;
  const sequence=useRef(0),completed=useRef(new Set<string>());
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{const timer=setTimeout(()=>{setSearch(query);setOffset(0);},250);return()=>clearTimeout(timer);},[query]);
  const load=useCallback(async(signal?:AbortSignal,incremental=false)=>{
    if(document.hidden)return;
    activeLoad.current?.abort();
    const controller=new AbortController();activeLoad.current=controller;
    const requestSignal=signal ? AbortSignal.any([signal,controller.signal,AbortSignal.timeout(20000)]) : AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]);
    const current=++sequence.current;
    try {
      const params=new URLSearchParams({q:search,client,year,unavailable:unavailable?'1':'0',offset:String(offset)});
      const filterKey=params.toString();
      const previous=currentCatalog.current;
      if(incremental && previous && catalogKey.current===filterKey){params.set('revision',previous.revision);params.set('pageIds',previous.rows.map(row=>row.id).join(','));}
      const response=await fetch(`/api/admin/archive?${params}`,{cache:'no-store',signal:requestSignal});
      let data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load archive.');
      if(current!==sequence.current || requestSignal.aborted)return;
      if(data.unchanged && previous){
        const jobs=new Map<string,ArchiveRow['job']>(data.jobs.map((job:NonNullable<ArchiveRow['job']>)=>[job.vimeo_id,job]));
        data={...previous,state:data.state,activeJobs:data.activeJobs,rows:previous.rows.map(row=>({...row,job:jobs.get(row.id)||null}))};
      }
      currentCatalog.current=data;catalogKey.current=filterKey;
      setCatalog(data);setError('');
      if(client && (data.clientCounts[client]||0)<2){setClient('');setOffset(0);}
      setSelected(previous=>previous?data.rows.find((row:ArchiveRow)=>row.id===previous.id)||previous:null);
      let refreshMux=false;
      for(const row of data.rows as ArchiveRow[])if(row.job?.state==='ready'&&!completed.current.has(row.job.id)){completed.current.add(row.job.id);refreshMux=true;}
      if(refreshMux)onImported();
    }catch(e){if(current===sequence.current&&!requestSignal.aborted)setError(e instanceof Error?e.message:'Unable to load archive.');}
    finally{if(activeLoad.current===controller)activeLoad.current=null;if(current===sequence.current)setLoading(false);}
  },[search,client,year,unavailable,offset,onImported]);
  // The panel observes progress only. The background worker owns scans and imports.
  const latestLoad=useRef(load);latestLoad.current=load;
  useEffect(()=>{const controller=new AbortController();setLoading(true);void load(controller.signal);return()=>controller.abort();},[search,client,year,unavailable,offset]);
  const pausePolling=useRef(false);pausePolling.current=busy||query!==search;
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>,stopped=false,running=false;
    const schedule=()=>{clearTimeout(timer);if(!stopped)timer=setTimeout(tick,currentCatalog.current?.activeJobs || currentCatalog.current?.state?.scan_status==='scanning'?5000:30000);};
    const tick=async()=>{if(stopped||running)return;if(!document.hidden&&!pausePolling.current&&!activeLoad.current){running=true;try{await latestLoad.current(undefined,true);}finally{running=false;}}schedule();};
    const visibility=()=>{if(document.hidden){activeLoad.current?.abort();clearTimeout(timer);}else void tick();};
    schedule();document.addEventListener('visibilitychange',visibility);
    return()=>{stopped=true;clearTimeout(timer);activeLoad.current?.abort();sequence.current++;document.removeEventListener('visibilitychange',visibility);};
  },[Boolean(catalog?.activeJobs || catalog?.state?.scan_status==='scanning')]);
  async function action(body:object) {
    setBusy(true);setError('');
    try{const response=await fetch('/api/admin/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Archive action failed.');if(['assign-clients','rename-client','undo-clients'].includes((body as {action:string}).action)){setNotice(`${data.count} video${data.count===1?'':'s'} updated.`);setChecked([]);setOffset(0);setSelected(null);if((body as {action:string}).action==='rename-client'){setSourceLabels([]);setTargetLabel('');setLabelSearch('');}}await latestLoad.current();}
    catch(e){setError(e instanceof Error?e.message:'Archive action failed.');}
    finally{setBusy(false);}
  }
  function choose(row:ArchiveRow){setSelected(row);setTitle(row.title);setAssignedClient(catalog?.directoryClients.includes(row.client)?row.client:'');setFileId('');setPreviewError(false);}
  const row=selected,job=row?.job;
  const assetId=row?.muxAssetId || (job?.state==='ready'?job.asset_id:null);
  const workerOnline=Boolean(catalog?.state?.worker_seen_at && Date.now()-Date.parse(catalog.state.worker_seen_at)<180000);
  return createPortal(<dialog ref={dialog} className={styles.dialog} aria-label="Video archive" onCancel={event=>{event.preventDefault();event.stopPropagation();onClose();}} onKeyDown={event=>event.stopPropagation()} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className={styles.content}>
      <header className={styles.header}><div><p>VIMEO LIBRARY · GOOGLE DRIVE</p><h2>Archive</h2></div><button type="button" autoFocus onClick={onClose} aria-label="Close archive">Close ×</button></header>
      <div className={styles.tools}><input aria-label="Search archive" placeholder="Search titles, clients, or folders…" value={query} onChange={event=>setQuery(event.target.value)}/><select aria-label="Archive client" value={client} onChange={event=>{setClient(event.target.value);setOffset(0);}}><option value="">All clients</option>{catalog?.clients.filter(value=>(catalog.clientCounts[value]||0)>1).map(value=><option key={value}>{value}</option>)}</select><select aria-label="Upload year" value={year} onChange={event=>{setYear(event.target.value);setOffset(0);}}><option value="">All years</option>{catalog?.years.map(value=><option key={value}>{value}</option>)}</select></div>
      <div className={styles.summary}><label><input type="checkbox" checked={unavailable} onChange={event=>{setUnavailable(event.target.checked);setOffset(0);}}/> Show unavailable / needs review</label><button type="button" disabled={busy||catalog?.state?.scan_status==='scanning'} onClick={()=>void action({action:'scan'})}>{catalog?.state?.scan_status==='scanning'?'Checking Drive…':'Refresh archive'}</button></div>
      <div className={styles.editTools}>
        <button type="button" aria-pressed={editing} onClick={()=>{setEditing(!editing);setChecked([]);}}>{editing?'Done editing clients':'Edit clients'}</button>
        <button type="button" aria-expanded={manage} onClick={()=>setManage(!manage)}>Manage archive clients</button>
        {catalog?.lastEdit&&<button type="button" disabled={busy} onClick={()=>void action({action:'undo-clients',editId:catalog.lastEdit!.id})}>Undo last client edit ({catalog.lastEdit.count} videos)</button>}
      </div>
      {(editing||manage)&&<p className={styles.meta}>Archive labels only. These changes do not update clients in Mux, Deck, or HQ.</p>}
      {notice&&<p className={styles.notice} role="status">{notice}</p>}
      <datalist id="archive-labels">{catalog?.clients.map(value=><option key={value} value={value}/>)}</datalist>
      {editing&&<div className={styles.bulk}>
        <div className={styles.editTools}><button type="button" disabled={loading||busy||query!==search} onClick={()=>setChecked([...new Set([...checked,...(catalog?.rows.map(item=>item.id)||[])])])}>Select page</button><button type="button" disabled={loading||busy||query!==search} onClick={()=>setChecked(catalog?.matchingIds||[])}>Select all {catalog?.total||0} matching videos</button><button type="button" onClick={()=>setChecked([])}>Clear selection</button><strong>{checked.length} selected</strong></div>
        <form className={styles.editTools} onSubmit={event=>{event.preventDefault();void action({action:'assign-clients',ids:checked,label:bulkLabel});}}><label>Archive client label <input list="archive-labels" required maxLength={120} value={bulkLabel} onChange={event=>setBulkLabel(event.target.value)} placeholder="Choose or create a label"/></label><button type="submit" disabled={busy||!checked.length||!bulkLabel.trim()}>Assign to {checked.length} videos</button><button type="button" disabled={busy||!checked.length} onClick={()=>void action({action:'assign-clients',ids:checked,label:''})}>Clear client on {checked.length} videos</button></form>
      </div>}
      {manage&&<form className={styles.bulk} onSubmit={event=>{event.preventDefault();void action({action:'rename-client',sources:sourceLabels,label:targetLabel});}}>
        <h3>Combine archive clients</h3>
        <p className={styles.meta}>Select the labels that belong together, then choose the name to keep. This includes every video with those labels, regardless of video filters.</p>
        <div className={styles.mergeLayout}>
          <div><input className={styles.labelSearch} aria-label="Find archive client labels" placeholder="Find client labels…" value={labelSearch} onChange={event=>setLabelSearch(event.target.value)}/>
            <div className={styles.clientList} role="group" aria-label="Archive client labels">
              {catalog?.clients.filter(value=>value.toLocaleLowerCase().includes(labelSearch.trim().toLocaleLowerCase())).map(value=><label key={value}><input type="checkbox" checked={sourceLabels.includes(value)} disabled={busy} onChange={event=>setSourceLabels(previous=>event.target.checked?[...previous,value]:previous.filter(item=>item!==value))}/><span>{value}</span><small>{catalog.clientCounts[value]} videos</small></label>)}
              {catalog&&!catalog.clients.some(value=>value.toLocaleLowerCase().includes(labelSearch.trim().toLocaleLowerCase()))&&<p className={styles.meta}>No labels match.</p>}
            </div>
          </div>
          <div className={styles.mergeDestination}>
            <strong>{sourceLabels.length} labels selected · {sourceLabels.reduce((sum,value)=>sum+(catalog?.clientCounts[value]||0),0)} videos</strong>
            <div className={styles.chips}>{sourceLabels.map(value=><button type="button" key={value} disabled={busy} aria-label={`Remove ${value} from merge`} onClick={()=>setSourceLabels(previous=>previous.filter(item=>item!==value))}>{value} ×</button>)}</div>
            <button type="button" disabled={busy||!sourceLabels.length} onClick={()=>setSourceLabels([])}>Clear selected labels</button>
            <label>Name to keep<input required list="archive-labels" maxLength={120} value={targetLabel} onChange={event=>setTargetLabel(event.target.value)} placeholder="Existing or new client label"/></label>
            <p className={styles.meta}>Choose an existing label to merge into it, or enter a cleaner name. Selections stay checked while you search.</p>
            <button className={styles.primary} type="submit" disabled={busy||!targetLabel.trim()||!sourceLabels.some(value=>value!==targetLabel.trim())}>{busy?'Combining…':`Combine ${sourceLabels.length} labels`}</button>
          </div>
        </div>
      </form>}
      <p className={styles.meta} role="status">{catalog?`${catalog.available.toLocaleString()} verified · ${catalog.catalogTotal.toLocaleString()} in catalog`:'Loading archive…'}{catalog?.state?.checked_at?` · Last verified ${new Date(catalog.state.checked_at).toLocaleString()}`:''}</p>
      {catalog?.state?.scan_status==='scanning'&&<p className={styles.meta} role="status">Checking folders: {catalog.state.scanProgress?.done||0} of {catalog.state.scanProgress?.folders||0} discovered. You can close this panel while the scan continues.</p>}
      {catalog&&!workerOnline&&<p className={styles.notice}>The archive worker is offline. Existing results are available; refreshes and imports will resume when it reconnects.</p>}
      {catalog?.state?.error&&<p className={styles.notice}>Drive verification paused: {catalog.state.error} The last completed scan is still shown.</p>}
      {error&&<p role="alert" className={styles.error}>{error}</p>}
      <div className={`${styles.layout} ${row?styles.withPreview:''}`}>
        <section aria-label="Archive results" className={styles.results} aria-busy={loading}>
          {catalog?.rows.map(entry=><div key={entry.id} className={styles.selectRow}>{editing&&<input type="checkbox" aria-label={`Select ${entry.title}`} checked={checked.includes(entry.id)} disabled={busy} onChange={event=>setChecked(previous=>event.target.checked?[...previous,entry.id]:previous.filter(id=>id!==entry.id))}/>}<button type="button" className={`${styles.row} ${row?.id===entry.id?styles.selected:''}`} key={entry.id} onClick={()=>choose(entry)} aria-pressed={row?.id===entry.id}><strong>{entry.title}</strong><small>{folder(entry)}</small><small>Client: {entry.client||'Unassigned'}</small><span><time dateTime={entry.uploadDate}>Uploaded {date(entry.uploadDate)}</time><i>{entry.muxAssetId||entry.job?.state==='ready'?'In Mux':entry.job?entry.job.state:availability(entry)}</i></span></button></div>)}
          {catalog&&!catalog.rows.length&&<p className={styles.empty}>{!catalog.catalogTotal?'Import the Vimeo CSV to build the catalog.':!catalog.state?.active_scan?'Refresh archive to verify the transferred files in Drive.':unavailable?'No archive videos match this search.':'No verified videos match. Try “Show unavailable / needs review” or refresh the archive.'}</p>}
          {catalog&&<nav className={styles.pages} aria-label="Archive pages"><button type="button" disabled={!offset||loading} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous</button><span>{catalog.total?`${offset+1}–${Math.min(offset+50,catalog.total)} of ${catalog.total}`:'0 results'}</span><button type="button" disabled={catalog.nextOffset===null||loading} onClick={()=>setOffset(catalog.nextOffset||0)}>Next</button></nav>}
        </section>
        {row&&<section className={styles.detail} aria-label={`Preview ${row.title}`}><div className={styles.detailHeader}><h3>{row.title}</h3><button type="button" aria-label="Close video details" onClick={()=>setSelected(null)}>×</button></div><p className={styles.meta}>{folder(row)}<br/>Uploaded {date(row.uploadDate)} · {Math.floor(row.duration/60)}:{String(Math.round(row.duration%60)).padStart(2,'0')}</p>
          {row.status==='available'&&<><video key={row.id} className={styles.video} src={`/api/admin/archive?preview=${encodeURIComponent(row.id)}`} controls playsInline preload="none" onError={()=>setPreviewError(true)}/>{previewError&&<p className={styles.notice}>This file could not play here. Try opening it in Drive, or refresh to verify access.</p>}</>}
          {row.file&&<a className={styles.driveLink} href={`https://drive.google.com/file/d/${row.file.id}/view`} target="_blank" rel="noreferrer">Open in Drive ↗</a>}
          {assetId?<a className={styles.primary} href={`/admin/mux/${assetId}`}>View in Mux ↗</a>:job?<div className={styles.job} role="status"><strong>{job.state==='ready'?'Ready':job.state==='failed'?'Import needs attention':job.state==='processing'?'Processing in Mux':job.state==='queued'?'Queued':'Importing to Mux'}</strong>{job.byte_size>0&&<progress max={job.byte_size} value={job.bytes_done}/>}<small>{Math.round(job.bytes_done/job.byte_size*100)}% transferred · You can close this panel.</small>{job.error&&<p>{job.error}</p>}{job.state==='failed'&&<button type="button" disabled={busy||!workerOnline} onClick={()=>void action({action:'retry',id:row.id})}>Retry import</button>}</div>:row.status==='available'?<form className={styles.importForm} onSubmit={event=>{event.preventDefault();void action({action:'import',id:row.id,title,client:assignedClient});}}><label>Title<input required maxLength={240} value={title} onChange={event=>setTitle(event.target.value)}/></label><label>Mux client<select value={assignedClient} onChange={event=>setAssignedClient(event.target.value)}><option value="">Unassigned</option>{catalog?.directoryClients.map(value=><option key={value}>{value}</option>)}</select></label><p>Copies this video to Mux. The Drive original stays in place. Anyone with the Mux link can watch; the video is not added to public listings.</p><button className={styles.primary} type="submit" disabled={busy||!workerOnline}>{busy?'Preparing…':'Import to Mux'}</button></form>:<div className={styles.review}><h4>{availability(row)}</h4><p>Choose the correct Drive file to verify this record.</p>{row.candidates.map(file=><div key={file.id}><a href={`https://drive.google.com/file/d/${file.id}/view`} target="_blank" rel="noreferrer">{file.name} ↗</a><small>{file.path}</small><button type="button" disabled={busy} onClick={()=>void action({action:'link',id:row.id,fileId:file.id})}>Use this file</button></div>)}<form onSubmit={event=>{event.preventDefault();void action({action:'link',id:row.id,fileId:fileId.trim()});}}><label>Or paste a Drive file ID<input required value={fileId} onChange={event=>setFileId(event.target.value)}/></label><button type="submit" disabled={busy}>Verify file</button></form></div>}
        </section>}
      </div>
    </div>
  </dialog>,document.body);
}
