'use client';
import { useRef,useState } from 'react';
import { localDate,parseTodo,type Token } from '@/lib/todo-parser';
import { UiIcon } from './UiIcon';
import styles from './ClientHQ.module.css';

export function TodoEntry({initial,members,busy,onSave,onCancel}:{initial:{title?:string;assignee?:string;due_on?:string};members:string[];busy:boolean;onSave:(value:{title:string;assignee:string;due_on:string})=>void;onCancel:()=>void}) {
  const originalNames=(initial.assignee || '').split(',').map(n=>n.trim()).filter(Boolean);
  const knownNames=originalNames.flatMap(n=>{const match=members.find(m=>m.toLowerCase()===n.toLowerCase());return match?[match]:[];});
  const unknownNames=originalNames.filter(n=>!members.some(m=>m.toLowerCase()===n.toLowerCase()));
  const [text,setText]=useState([initial.title || '',...unknownNames.map(n=>`@[${n}]`)].join(' ').trim()),[baseDate,setBaseDate]=useState(initial.due_on || ''),[baseName,setBaseName]=useState(knownNames.join(', '));
  const [suggestionsOpen,setSuggestionsOpen]=useState(true);
  const [literal,setLiteral]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const parsed=literal?{title:text.trim(),date:undefined,mentions:[],unmatched:[],assignee:''}:parseTodo(text,members);
  const due=parsed.date?.value || baseDate,assignee=parsed.assignee || baseName;
  const suffix=text.match(/(?:^|\s)@([\p{L}\p{N}_ '-]*)$/u);
  const suggestions=suffix && suggestionsOpen ? members.filter(m=>m.toLowerCase().includes(suffix[1].toLowerCase())).slice(0,6) : [];
  const drop=(tokens:Token[])=>{let next=text;for(const token of [...tokens].sort((a,b)=>b.start-a.start))next=next.slice(0,token.start)+next.slice(token.end);setText(next.replace(/\s+/g,' ').trim());input.current?.focus();};
  return <form className={`${styles.editor} ${styles.todoEntry}`} onSubmit={e=>{e.preventDefault();if(parsed.title.trim())onSave({title:parsed.title,assignee,due_on:due});}}>
    <label>To-do<input ref={input} autoFocus required maxLength={400} value={text} disabled={busy} placeholder="Write campaign script by Friday @Tyler" aria-describedby="todo-entry-help" onChange={e=>{setText(e.target.value);setSuggestionsOpen(true);}} onKeyDown={e=>{if(e.key==='Escape')setSuggestionsOpen(false);}}/></label>
    {suggestions.length>0 && <div className={styles.mentionSuggestions} aria-label="Team suggestions">{suggestions.map(name=><button type="button" key={name} onClick={()=>{const start=text.lastIndexOf('@');setText(text.slice(0,start)+`@[${name}] `);setSuggestionsOpen(false);input.current?.focus();}}>@{name}</button>)}</div>}
    {parsed.unmatched.map(token=><label key={token.start} className={styles.unmatchedName}>@{token.value} isn’t in the team directory. It will stay in the task text.
      <select aria-label={`Choose team member for ${token.value}`} value="" disabled={busy || !members.length} onChange={e=>{if(e.target.value){setText(text.slice(0,token.start)+`@[${e.target.value}]`+text.slice(token.end));setSuggestionsOpen(false);input.current?.focus();}}}><option value="">{members.length?'Choose a team member…':'No team members available'}</option>{members.map(name=><option key={name} value={name}>{name}</option>)}</select>
    </label>)}
    {(due || assignee) && <div className={styles.parsedLabels} aria-live="polite">
      {due && <button type="button" aria-label="Remove due date" onClick={()=>{setBaseDate('');if(parsed.date)drop([parsed.date]);}}><span>Due {new Date(due+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}{due<localDate(new Date())?' · Past date':''}</span><UiIcon name="close"/></button>}
      {assignee && <button type="button" aria-label="Remove assignment" onClick={()=>{setBaseName('');drop(parsed.mentions);}}><span>@{assignee}</span><UiIcon name="close"/></button>}
    </div>}
    <p id="todo-entry-help">Try “due”, “before”, “by”, “on”, or “no later than”. Dates use month/day. Use @[Full Name] for a full name.</p>
    {(parsed.date || parsed.mentions.length>0) && <p className={styles.taskPreview}>Task: {parsed.title || 'Add the task itself…'}</p>}
    {(literal || parsed.date || parsed.mentions.length>0) && <button type="button" className={styles.literalToggle} onClick={()=>setLiteral(!literal)}>{literal?'Recognize dates & names':'Keep typed text as task title'}</button>}
    <div className={styles.actions}><button disabled={busy || !parsed.title || parsed.title.length>240 || assignee.length>120}>{busy?'Saving…':'Save to-do'}</button><button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
    {(parsed.title.length>240 || assignee.length>120) && <p role="alert">Please shorten the task or assignment before saving.</p>}
  </form>;
}
