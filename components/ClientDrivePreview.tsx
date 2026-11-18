'use client';
import { useEffect,useRef } from 'react';
import { UiIcon } from './UiIcon';
import styles from './ClientHQ.module.css';
export function ClientDrivePreview({file,onClose}:{file:{id:string;name:string};onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=dialog.current!;const trigger=document.activeElement as HTMLElement;const overflow=document.body.style.overflow;el.showModal();document.body.style.overflow='hidden';return()=>{el.close();document.body.style.overflow=overflow;trigger?.focus();};},[]);
  return <dialog ref={dialog} className={`${styles.noteModal} ${styles.driveModal}`} aria-label={`Preview ${file.name}`} onCancel={e=>{e.preventDefault();onClose();}}>
    <header><h2>{file.name}</h2><button aria-label="Close file preview" onClick={onClose}><UiIcon name="close"/></button></header>
    <iframe className={styles.drivePreviewFrame} title={`Preview ${file.name}`} src={`https://drive.google.com/file/d/${encodeURIComponent(file.id)}/preview`} allow="fullscreen" allowFullScreen/>
    <footer className={styles.drivePreviewFooter}><span>Preview unavailable or asking you to sign in?</span> <a href={`https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`} target="_blank" rel="noreferrer">Open in Drive <UiIcon name="external"/></a></footer>
  </dialog>;
}
