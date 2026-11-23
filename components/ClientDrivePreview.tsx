'use client';
import { useEffect,useRef,useState } from 'react';
import { UiIcon } from './UiIcon';
import { ClientDrivePdf } from './ClientDrivePdf';
import styles from './ClientHQ.module.css';
type Info={kind:string;name:string;downloadable:boolean};
export function ClientDrivePreview({file,client,root,onClose}:{file:{id:string;name:string};client:string;root:string;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const [info,setInfo]=useState<Info|null>(null),[error,setError]=useState(''),[text,setText]=useState('');
 const url=`/api/admin/client-hq-drive?${new URLSearchParams({client,root,preview:file.id})}`;
 useEffect(()=>{const el=dialog.current!;const trigger=document.activeElement as HTMLElement;const overflow=document.body.style.overflow;el.showModal();document.body.style.overflow='hidden';return()=>{el.close();document.body.style.overflow=overflow;trigger?.focus();};},[]);
 useEffect(()=>{const controller=new AbortController();setInfo(null);setError('');setText('');
  async function load(){const response=await fetch(`${url}&info=1`,{signal:controller.signal,cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to open this file.');setInfo(data);if(!data.downloadable)throw new Error('This file cannot be downloaded through the connected account. Open it in Drive.');if(data.kind==='text'){const content=await fetch(url,{signal:controller.signal,cache:'no-store'});if(!content.ok)throw new Error('Unable to load this file.');setText(await content.text());}}
  void load().catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();
 },[url]);
 const failed=()=>setError('This file could not be displayed. Download it or open it in Drive below.');
 return <dialog ref={dialog} className={`${styles.noteModal} ${styles.driveModal}`} aria-label={`Preview ${file.name}`} onCancel={e=>{e.preventDefault();onClose();}}>
  <header><h2>{file.name}</h2><button aria-label="Close file preview" onClick={onClose}><UiIcon name="close"/></button></header>
  <div className={styles.drivePrivatePreview}>{error?<p role="alert">{error}</p>:!info?<p role="status">Loading preview…</p>:info.kind==='pdf'?<ClientDrivePdf url={url}/>:info.kind==='image'?<img src={url} alt={file.name} onError={failed}/>:info.kind==='video'?<video src={url} controls playsInline onError={failed}/>:info.kind==='audio'?<audio src={url} controls onError={failed}/>:info.kind==='text'?<pre>{text}</pre>:<p>This file format does not have an in-app preview. Download it or open it in Drive.</p>}</div>
  <footer className={styles.drivePreviewFooter}>{info?.downloadable&&<a href={`${url}&download=1`} download={info.name}>Download</a>} <a href={`https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`} target="_blank" rel="noreferrer">Open in Drive <UiIcon name="external"/></a></footer>
 </dialog>;
}
