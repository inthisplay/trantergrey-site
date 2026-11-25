'use client';
import { useEffect,useRef,useState } from 'react';
import { hqRequest } from './ClientHQ';
import { UiIcon } from './UiIcon';
import { ClientDrivePdf } from './ClientDrivePdf';
import styles from './ClientHQ.module.css';
type Info={kind:string;name:string;downloadable:boolean;canTrash?:boolean;version?:string;originalName?:string};
export function ClientDrivePreview({file,client,root,onClose,onTrashed}:{file:{id:string;name:string};client:string;root:string;onClose:()=>void;onTrashed:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const [info,setInfo]=useState<Info|null>(null),[error,setError]=useState(''),[text,setText]=useState('');
 const [deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState('');
 const deleteLock=useRef(false),trashRequestId=useRef('');
 const close=()=>{if(!deleteLock.current)onClose();};
 async function trash(){
  if(deleteLock.current || !info?.canTrash || !info.version)return;
  if(!confirm(`Move “${info.originalName || file.name}” to Google Drive’s trash? This removes the actual file for everyone. It can be restored from Drive’s trash for 30 days.`))return;
  deleteLock.current=true;setDeleting(true);setDeleteError('');
  try{
   const key=`chq-trash:${client}:${root}:${file.id}:${info.version}`;
   if(!trashRequestId.current){try{trashRequestId.current=sessionStorage.getItem(key)||crypto.randomUUID();sessionStorage.setItem(key,trashRequestId.current);}catch{trashRequestId.current=crypto.randomUUID();}}
   await hqRequest('/api/admin/client-hq-files',{clientId:client,rootId:root,fileId:file.id,expectedVersion:info.version,requestId:trashRequestId.current});
   onTrashed();
  }catch(cause){setDeleteError(cause instanceof Error?cause.message:'Could not confirm deletion. Check Drive before retrying.');}
  finally{deleteLock.current=false;setDeleting(false);}
 }
 const url=`/api/admin/client-hq-drive?${new URLSearchParams({client,root,preview:file.id})}`;
 useEffect(()=>{const el=dialog.current!;const trigger=document.activeElement as HTMLElement;const overflow=document.body.style.overflow;el.showModal();document.body.style.overflow='hidden';return()=>{el.close();document.body.style.overflow=overflow;trigger?.focus();};},[]);
 useEffect(()=>{const controller=new AbortController();setInfo(null);setError('');setText('');
  async function load(){const response=await fetch(`${url}&info=1`,{signal:controller.signal,cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to open this file.');setInfo(data);if(!data.downloadable)throw new Error('This file cannot be downloaded through the connected account. Open it in Drive.');if(data.kind==='text'){const content=await fetch(url,{signal:controller.signal,cache:'no-store'});if(!content.ok)throw new Error('Unable to load this file.');setText(await content.text());}}
  void load().catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();
 },[url]);
 const failed=()=>setError('This file could not be displayed. Download it or open it in Drive below.');
 return <dialog ref={dialog} className={`${styles.noteModal} ${styles.driveModal}`} aria-label={`Preview ${file.name}`} onCancel={e=>{e.preventDefault();close();}}>
  <header><h2>{file.name}</h2><button aria-label="Close file preview" disabled={deleting} onClick={close}><UiIcon name="close"/></button></header>
  <div className={styles.drivePrivatePreview}>{error?<p role="alert">{error}</p>:!info?<p role="status">Loading preview…</p>:info.kind==='pdf'?<ClientDrivePdf url={url}/>:info.kind==='image'?<img src={url} alt={file.name} onError={failed}/>:info.kind==='video'?<video src={url} controls playsInline onError={failed}/>:info.kind==='audio'?<audio src={url} controls onError={failed}/>:info.kind==='text'?<pre>{text}</pre>:<p>This file format does not have an in-app preview. Download it or open it in Drive.</p>}</div>
  <footer className={styles.drivePreviewFooter}>{deleteError && <p role="alert">{deleteError}</p>}{info && <button type="button" title={info.canTrash && info.version ? 'Move this file to Google Drive trash' : 'This file cannot be trashed through the connected Drive account'} disabled={deleting || !info.canTrash || !info.version} onClick={()=>void trash()}>{deleting?'Moving to trash…':'Delete file'}</button>}{info?.downloadable&&<a href={`${url}&download=1`} download={info.name}>Download</a>} <a href={`https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`} target="_blank" rel="noreferrer">Open in Drive <UiIcon name="external"/></a></footer>
 </dialog>;
}
