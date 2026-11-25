'use client';
import { useEffect, useRef, useState } from 'react';
import { hqRequest } from './ClientHQ';
import styles from './ClientHQ.module.css';
type Preview={clientId:string;name:string;expectedVersion:string;notes:number;todos:number;cards:number;muxAssets:number;linkedDriveFolders:number;coverage:string};
export function ClientDeleteDialog({clientId,onClose,onDeleted}:{clientId:string;onClose:()=>void;onDeleted:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false),requestId=useRef('');
 const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const url=`/api/internal/v1/clients/${encodeURIComponent(clientId)}/deletion`;
 useEffect(()=>{const el=dialog.current!,trigger=document.activeElement as HTMLElement;el.showModal();return()=>{el.close();trigger?.focus();};},[]);
 async function load(){setPreview(null);setError('');try{const result=await hqRequest(url);requestId.current=crypto.randomUUID();setPreview(result);}catch(cause){setError(cause instanceof Error?cause.message:'Could not load deletion counts.');}}
 useEffect(()=>{void load();},[clientId]);
 async function remove(){if(!preview||lock.current)return;lock.current=true;setBusy(true);setError('');try{await hqRequest(url,{confirmName:preview.name,expectedVersion:preview.expectedVersion,requestId:requestId.current});onDeleted();}catch(cause){setError(cause instanceof Error?cause.message:'Could not confirm deletion. Retry this request.');}finally{lock.current=false;setBusy(false);}}
 return <dialog ref={dialog} className={styles.clientDeleteDialog} aria-labelledby="client-delete-title" onCancel={event=>{event.preventDefault();if(!lock.current)onClose();}}>
  <h2 id="client-delete-title">Delete {preview?`“${preview.name}”`:'client'}?</h2>
  {!preview&&!error&&<p role="status">Checking linked work…</p>}
  {preview&&<><p>This permanently removes the client from the shared directory and deletes its CHQ workspace.</p>
   <dl><div><dt>Notes to delete</dt><dd>{preview.notes}</dd></div><div><dt>To-dos to delete</dt><dd>{preview.todos}</dd></div><div><dt>Linked Mux assets — kept</dt><dd>{preview.muxAssets}</dd></div><div><dt>Linked Deck cards — kept</dt><dd>{preview.cards}</dd></div></dl>
   <p><strong>Google Drive files, Mux assets, and Deck cards will not be deleted.</strong> Existing client labels on cards and videos will stay as they are.</p>
   <small>Counts use saved library data and include archived/completed cards. Refresh the Mux library first if assets changed outside this app.</small>
  </>}
  {error&&<p role="alert">{error} <button type="button" disabled={busy} onClick={()=>void load()}>Refresh counts</button></p>}
  <div className={styles.actions}><button type="button" autoFocus disabled={busy} onClick={onClose}>Cancel</button><button type="button" disabled={busy||!preview} onClick={()=>void remove()}>{busy?'Deleting…':'Delete client'}</button></div>
 </dialog>;
}
