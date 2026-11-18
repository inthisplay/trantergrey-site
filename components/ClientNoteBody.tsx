'use client';
import { useId,useState } from 'react';
import { clientNoteHtml, clientNotePreview, type NoteContent } from '@/lib/client-note';
import { UiIcon } from './UiIcon';
import styles from './ClientHQ.module.css';

export function ClientNoteBody(note:NoteContent) {
  const [expanded,setExpanded]=useState(false);
  const id=useId();
  const {text:body,videos}=clientNotePreview(note);
  const preview=body.replace(/\s+/g,' ').trim();
  const long=videos.length>0 || body.length>180 || body.split('\n').length>3;
  return <div>
    <div id={id}>{long && !expanded ? <>
      {preview && <p className={styles.body}>{preview.slice(0,140)}{preview.length>140?'…':''}</p>}
      {videos.slice(0,3).map((video,index)=><button key={index} type="button" className={styles.noteVideoPreview} aria-label={`Show ${video.title} player${video.duration ? ` (${video.duration})` : ''}`} aria-expanded={false} aria-controls={id} onClick={()=>setExpanded(true)}><span className={styles.noteVideoLabel}>{video.label}</span><span className={styles.noteVideoTitle}>{video.title}</span>{video.duration && <span className={styles.noteVideoDuration}>{video.duration}</span>}<UiIcon name="play"/></button>)}
      {videos.length>3 && <p className={styles.noteVideoMore}>+{videos.length-3} more video attachments</p>}
    </> : <div className={styles.richNote} dangerouslySetInnerHTML={{__html:clientNoteHtml(note).replace(/<input /g,'<input disabled ')}}/>}</div>
    {long && <button type="button" className={styles.noteReadToggle} aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(!expanded)}><UiIcon name={expanded?'up':'chevronDown'}/>{expanded?'Show less':'Read full note'}</button>}
  </div>;
}
