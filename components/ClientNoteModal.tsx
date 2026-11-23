'use client';
import { useEffect,useId,useRef } from 'react';
import { clientNoteHtml, type NoteContent } from '@/lib/client-note';
import { UiIcon } from './UiIcon';
import styles from './ClientHQ.module.css';

export function ClientNoteModal({note,onClose}:{note:NoteContent & {title:string};onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const titleId=useId();
  useEffect(()=>{
    const element=dialog.current!;
    const previousOverflow=document.body.style.overflow;
    const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;
    element.showModal();
    document.body.style.overflow='hidden';
    return ()=>{element.close();document.body.style.overflow=previousOverflow;trigger?.focus();};
  },[]);
  return <dialog ref={dialog} className={styles.noteModal} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget){const rect=e.currentTarget.getBoundingClientRect();if(e.clientX<rect.left || e.clientX>rect.right || e.clientY<rect.top || e.clientY>rect.bottom)onClose();}}}>
    <header><div><p>Client note</p><h2 id={titleId}>{note.title}</h2></div><button type="button" autoFocus aria-label="Close note" onClick={onClose}><UiIcon name="close"/></button></header>
    <div className={styles.noteModalText} tabIndex={0}><div className={styles.richNote} dangerouslySetInnerHTML={{__html:clientNoteHtml(note).replace(/<input /g,'<input disabled ') || 'This note has no text yet.'}}/></div>
  </dialog>;
}
