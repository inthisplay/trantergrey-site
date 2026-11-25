'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { clientPinColor, type ClientPreference } from '@/lib/client-preferences';
import { columnColorStyle } from '@/lib/deck-colors';
import { ColorPickerDialog } from './ColorPickerDialog';
import { clientLogoUrl } from './ClientLogoSettings';
import { UiIcon } from './UiIcon';
import styles from './ClientHQ.module.css';

export function ClientDirectoryCard({client,href,preference,canCustomize,onSave,onArchive,onDelete}:{
 client:{logo_key?:string|null;id:string;name:string;open_todos?:number;archived?:number};href:string;preference?:ClientPreference;canCustomize:boolean;
 onDelete:()=>void;
 onArchive:(archived:boolean)=>Promise<void>;
 onSave:(patch:Partial<ClientPreference>)=>Promise<void>;
}) {
 const [colorOpen,setColorOpen]=useState(false);
 const [open,setOpen]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const menu=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 async function save(patch:Partial<ClientPreference>|{archived:boolean}){setSaving(true);setError('');try{if('archived' in patch)await onArchive(patch.archived);else await onSave(patch);setOpen(false);trigger.current?.focus();}catch(e){setError(e instanceof Error?e.message:'Unable to save. Try again.');}finally{setSaving(false);}}
 const color=preference?.color;
 return <article className={styles.clientCard} data-colored={color?true:undefined} data-archived={client.archived?true:undefined} style={color?{'--client-color':color,'--client-ink':columnColorStyle(color)['--deck-column-ink']} as CSSProperties:undefined}>
  <a href={href}>{client.logo_key ? <img className={styles.cardLogo} src={clientLogoUrl(client.id,client.logo_key)} alt=""/> : <span className={styles.initial}>{client.name.slice(0,2).toUpperCase()}</span>}<h2>{client.name}</h2><span>{client.open_todos||0} open to-dos{client.archived?' · Archived':''}</span><UiIcon name="forward"/></a>
  <div ref={menu} className={styles.clientCardMenu}>
   {preference?.pinned&&!client.archived&&<span className={styles.clientPin} style={{color:clientPinColor(color)}} role="img" aria-label="Pinned to top" title="Pinned to top"><UiIcon name="pin"/></span>}
   <button ref={trigger} type="button" className={styles.clientMenuTrigger} aria-label={`Options for ${client.name}`} aria-expanded={open} aria-controls={`client-options-${client.id}`} onClick={()=>setOpen(!open)}><UiIcon name="more"/></button>
   {open&&<div id={`client-options-${client.id}`} className={styles.clientMenuPanel} role="group" aria-label={`${client.name} preferences`}>
    <p>Only for you</p>
    {!canCustomize?<p>Sign in with your Google account to customize clients.</p>:<>
     <button type="button" disabled={saving} onClick={()=>void save({pinned:!preference?.pinned})}>{preference?.pinned?'Unpin from top':'Pin to top'}</button>
     <button type="button" disabled={saving} onClick={()=>{setOpen(false);setColorOpen(true);}}>Card color…</button>
    </>}
    <p className={styles.sharedPreference}>For everyone</p>
     <button type="button" disabled={saving} onClick={()=>void save({archived:!client.archived})}>{client.archived?'Restore client':'Archive client'}</button>
    <button type="button" disabled={saving} onClick={()=>{setOpen(false);onDelete();}}>Delete client…</button>
    {saving&&<p role="status">Saving…</p>}{error&&<p role="alert">{error}</p>}
   </div>}
  </div>
  {colorOpen&&<ColorPickerDialog name={client.name} title="Client card color" description={client.archived?'Choose your personal color. It will appear when this client is restored.':`Set the background for “${client.name}” just for you.`} color={color} onSave={async color=>{await onSave({color});}} onClose={()=>{setColorOpen(false);trigger.current?.focus();}}/>}
 </article>;
}
