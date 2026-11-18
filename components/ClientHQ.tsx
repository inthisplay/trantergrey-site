'use client';
import { DeckActivity } from './DeckActivity';
import { useEffect, useState } from 'react';
import { UiIcon } from './UiIcon';
import { ClientDrive } from './ClientDrive';
import { ClientDriveConnection } from './ClientDriveConnection';
import { TodoEntry } from './TodoEntry';
import { ClientNoteEditor } from './ClientNoteEditor';
import { ClientNoteBody } from './ClientNoteBody';
import { ClientNoteModal } from './ClientNoteModal';
import { isArchivedTodo } from '@/lib/client-todo';
import styles from './ClientHQ.module.css';

type Client={id:string;name:string;drive_folder_id:string|null;open_todos?:number};
type Item={id:string;workspace_id:string;kind:'todo'|'note';title:string;body:string;body_format?:string;body_json?:string|null;completed:number;completed_at?:string|null;due_on:string;assignee:string};
export async function hqRequest(url:string,body?:unknown) {
  const response=await fetch(url,body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {cache:'no-store'});
  if(response.status===401){window.location.assign(`/login?next=${encodeURIComponent(location.pathname+location.search)}`);throw new Error('Please sign in.');}
  const data=await response.json();if(!response.ok)throw new Error(data.error || 'Unable to save. Please try again.');return data;
}
export function ClientHQ(){
  const [clients,setClients]=useState<Client[]>([]),[client,setClient]=useState<Client|null>(null),[items,setItems]=useState<Item[]>([]);
  const [activityOpen,setActivityOpen]=useState(false);
  const [query,setQuery]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [expanded,setExpanded]=useState({todo:false,note:false,files:false});
  const [adding,setAdding]=useState(false),[settings,setSettings]=useState(false),[name,setName]=useState(''),[editor,setEditor]=useState<Partial<Item>|null>(null);
  const [related,setRelated]=useState<{cards:{id:string;title:string}[];videos:{id:string;title:string}[];cardsOffset:number;videosOffset:number;cardsNext:boolean;videosNext:boolean}|null>(null);
  const [members,setMembers]=useState<string[]>([]);
  const [readingNote,setReadingNote]=useState<Item|null>(null);
  const [showArchive,setShowArchive]=useState(false),[archiveClock,setArchiveClock]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setArchiveClock(Date.now()),60000);return ()=>clearInterval(timer);},[]);
  async function load(){
    const id=new URLSearchParams(location.search).get('client');
    const data=await hqRequest(`/api/admin/client-hq${id ? `?id=${encodeURIComponent(id)}` : ''}`);
    if(id){setClient(data.client);setItems(data.items);setMembers(data.members || []);}else{setClients(data.clients);setClient(null);}setLoading(false);
  }
  useEffect(()=>{load().catch(e=>{setError(e.message);setLoading(false);});},[]);
  async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:'Something went wrong.');}finally{setBusy(false);}}
  async function saveItem(item:Partial<Item>){await hqRequest('/api/admin/client-hq',{...item,workspace_id:client!.id});await load();}
  async function loadRelated(cardsOffset=0,videosOffset=0){const data=await hqRequest(`/api/admin/client-hq?id=${client!.id}&related=1&cardsOffset=${cardsOffset}&videosOffset=${videosOffset}`);setRelated(data);}
  function relatedPagination(kind:'cards'|'videos'){
    if(!related)return null;
    const offset=kind==='cards'?related.cardsOffset:related.videosOffset,hasNext=kind==='cards'?related.cardsNext:related.videosNext;
    if(!offset&&!hasNext)return null;
    const go=(next:number)=>void run(()=>loadRelated(kind==='cards'?next:related.cardsOffset,kind==='videos'?next:related.videosOffset));
    return <nav className={styles.relatedPagination} aria-label={kind==='cards'?'Deck card pages':'Video pages'}><button disabled={busy||offset===0} onClick={()=>go(offset-5)}>Previous</button><span>Page {Math.floor(offset/5)+1}</span><button disabled={busy||!hasNext} onClick={()=>go(offset+5)}>Next</button></nav>;
  }
  const todos=items.filter(i=>i.kind==='todo' && !isArchivedTodo(i,archiveClock)),notes=items.filter(i=>i.kind==='note');
  const archivedTodos=items.filter(i=>isArchivedTodo(i,archiveClock)).sort((a,b)=>(b.completed_at || '').localeCompare(a.completed_at || ''));
  return <><section data-client-workspace={client?.id} className={`${styles.hq} ${client?styles.workspace:''}`}>
    <a className={styles.back} href={client?'/admin/clients':'/admin'}><UiIcon name="back"/>{client?'All clients':'Admin dashboard'}</a>
    <header className={styles.heading}><div><p className={styles.eyebrow}>{client?'Client workspace':'TranterGrey / Client HQ'}</p><h1>{client?client.name:'Client HQ'}</h1>{!client && <p>A home for every client. Everything you need to keep work moving.</p>}</div>
      {!loading && <button onClick={()=>{setName(client?.name || '');client?setSettings(!settings):setAdding(!adding);}}><UiIcon name={client?'edit':'plus'}/>{client?'Client settings':'Add client'}</button>}
    </header>
    {error && <p className={styles.error} role="alert">{error} <button onClick={()=>void run(load)}>Retry</button></p>}
    {(adding || settings) && <form className={styles.editor} onSubmit={e=>{e.preventDefault();void run(async()=>{if(client){await hqRequest('/api/admin/clients',{oldName:client.name,newName:name});setSettings(false);await load();}else{const data=await hqRequest('/api/admin/client-hq',{action:'client',name});location.assign(`/admin/clients?client=${data.id}&setup=1`);}});}}>
      <h2>{client?'Client settings':'Add client'}</h2><label>Client name<input autoFocus required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
      <p>{client?'Renaming updates the shared client name in Deck and Mux.':'This client will be available in Client HQ, Deck, and Mux assignment fields. Choose a Drive folder after creating the workspace.'}</p>
      <div className={styles.actions}><button disabled={busy} type="submit">{busy?'Saving…':client?'Save name':'Create workspace'}</button><button type="button" onClick={()=>{setAdding(false);setSettings(false);}}>Cancel</button></div>
    </form>}
    {loading ? <p className={styles.empty}>Opening Client HQ…</p> : !client ? <>
      <ClientDriveConnection/>
      <label className={styles.search}>Find a client<input type="search" placeholder="Search clients…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <p className={styles.eyebrow}>{clients.filter(c=>c.name.toLowerCase().includes(query.toLowerCase())).length} clients</p>
      <div className={styles.clients}>{clients.filter(c=>c.name.toLowerCase().includes(query.toLowerCase())).map(c=><a key={c.id} href={`/admin/clients?client=${c.id}`}><span className={styles.initial}>{c.name.slice(0,2).toUpperCase()}</span><h2>{c.name}</h2><span>{c.open_todos || 0} open to-dos</span><UiIcon name="forward"/></a>)}</div>
      {!clients.some(c=>c.name.toLowerCase().includes(query.toLowerCase())) && <p className={styles.empty}>No matching clients. Add a client to start a workspace.</p>}
    </> : <>
      <details className={styles.related} onToggle={e=>{if(e.currentTarget.open && !related)void run(()=>loadRelated());}}><summary>Linked Deck cards & videos</summary>{related ? <><div className={styles.fields}><div><div className={styles.relatedHeading}><h3>Deck cards</h3><a className={styles.addDeckCard} href={`/admin/production?newCard=1&client=${encodeURIComponent(client.name)}`} aria-label={`Add Deck card for ${client.name}`} title="Add Deck card"><UiIcon name="plus"/>Add card</a></div>{related.cards.map(c=><a key={c.id} href={`/admin/production?card=${encodeURIComponent(c.id)}`}>{c.title} <UiIcon name="forward"/></a>)}{!related.cards.length && <p>No linked Deck cards.</p>}{relatedPagination('cards')}</div><div><h3>Videos</h3>{related.videos.map(v=><a key={v.id} href={`/admin/mux/${encodeURIComponent(v.id)}`}>{v.title} <UiIcon name="forward"/></a>)}{!related.videos.length && <p>No linked videos.</p>}{relatedPagination('videos')}</div></div></>:<p>Loading linked work…</p>}</details>
      <div data-workspace-panels className={styles.workspacePanels}>
      {(['todo','note'] as const).map(tab=><section className={styles.panel} key={tab} aria-label={tab==='todo'?'To-dos':'Notes'}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{tab==='todo'?`${todos.filter(i=>!i.completed).length} open`:`${notes.length} notes`}</p><h2>{tab==='todo'?'To-dos':'Notes'}</h2></div><button onClick={()=>setEditor({kind:tab,title:'',body:'',assignee:'',due_on:''})}><UiIcon name="plus"/>{tab==='todo'?'Add to-do':'Add note'}</button></div>
        {editor?.kind===tab && tab==='todo' && <TodoEntry key={editor.id || 'new'} initial={editor} members={members} busy={busy} onCancel={()=>setEditor(null)} onSave={value=>void run(async()=>{await saveItem({...editor,...value});setEditor(null);})}/>}
        {editor?.kind===tab && tab==='note' && <form className={styles.editor} onSubmit={e=>{e.preventDefault();void run(async()=>{await saveItem(editor);setEditor(null);});}}>
          <label>Note title<input autoFocus required maxLength={240} value={editor.title || ''} onChange={e=>setEditor({...editor,title:e.target.value})}/></label>
          <div>Note<ClientNoteEditor key={editor.id || 'new'} note={editor} client={client.name} disabled={busy} onChange={json=>setEditor({...editor,body_json:json,body_format:'html'})}/></div>
          <div className={styles.actions}><button disabled={busy}>{busy?'Saving…':'Save'}</button><button type="button" onClick={()=>setEditor(null)}>Cancel</button></div>
        </form>}
        <div id={`workspace-${tab}-items`} className={tab==='note'?styles.notes:styles.todos}>{(tab==='todo'?[...todos].sort((a,b)=>a.completed-b.completed):notes).slice(0,expanded[tab]?undefined:5).map(item=><article key={item.id} className={item.completed?styles.completed:''}>
          {tab==='todo' && <input type="checkbox" aria-label={`Complete ${item.title}`} checked={Boolean(item.completed)} disabled={busy} onChange={()=>void run(()=>saveItem({...item,completed:item.completed?0:1}))}/>}
          <div><h3>{item.title}</h3>{tab==='note' && item.body && <ClientNoteBody body={item.body} body_format={item.body_format} body_json={item.body_json}/>} {tab==='todo' && (item.assignee || item.due_on) && <small>{[item.assignee?`@${item.assignee}`:'',item.due_on?`Due ${item.due_on}`:''].filter(Boolean).join(' · ')}</small>}</div>
          <div className={styles.itemActions}>{tab==='note' && <button type="button" title="Open note in modal" aria-label={`Open ${item.title} in modal`} onClick={()=>setReadingNote(item)}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"/></svg></button>}<button aria-label={`Edit ${item.title}`} onClick={()=>setEditor(item)}><UiIcon name="edit"/></button><button disabled={busy} aria-label={`Delete ${item.title}`} onClick={()=>{if(confirm(`Delete ${tab==='note'?'note':'to-do'} “${item.title}”? This cannot be undone.`))void run(async()=>{await hqRequest('/api/admin/client-hq',{action:'delete',id:item.id,workspace_id:client.id});await load();});}}><UiIcon name="close"/></button></div>
        </article>)}</div>
        {!(tab==='todo'?todos:notes).length && editor?.kind!==tab && <div className={styles.empty}><UiIcon name={tab==='todo'?'checklist':'quote'}/><h3>{tab==='todo'?'Room for the next thing.':'Keep the context here.'}</h3><p>{tab==='todo'?'Add the first to-do for this client.':'Briefs, meeting notes, ideas—give them a home.'}</p></div>}
        {tab==='todo' && (todos.length<=5 || expanded.todo) && <>
          <button type="button" className={styles.archiveLink} aria-expanded={showArchive} aria-controls="todo-archive" onClick={()=>setShowArchive(!showArchive)}>{showArchive?'Hide archive':'View archive'}{archivedTodos.length ? ` (${archivedTodos.length})` : ''}</button>
          {showArchive && <div id="todo-archive" className={styles.todoArchive}><h3>Archived to-dos</h3><p>Completed more than 30 days ago.</p>{archivedTodos.length ? archivedTodos.map(item=><article key={item.id}><div><strong>{item.title}</strong><small>Completed {new Date(item.completed_at!).toLocaleDateString()}</small></div><button type="button" disabled={busy} aria-label={`Reopen ${item.title}`} onClick={()=>void run(()=>saveItem({...item,completed:0}))}>Reopen</button></article>) : <p>No archived to-dos yet.</p>}</div>}
        </>}
        {(tab==='todo'?todos:notes).length>5 && <button className={styles.expandPanel} aria-expanded={expanded[tab]} aria-controls={`workspace-${tab}-items`} onClick={()=>setExpanded({...expanded,[tab]:!expanded[tab]})}><UiIcon name={expanded[tab]?'up':'chevronDown'}/>{expanded[tab]?'Show less':`Show all ${tab==='todo'?todos.length:notes.length} ${tab==='todo'?'to-dos':'notes'}`}</button>}
      </section>)}
      <ClientDrive client={client} onChange={load}/>
      </div>
    </>}
    {readingNote && <ClientNoteModal note={readingNote} onClose={()=>setReadingNote(null)}/>}
  </section>
    {!loading && client && <DeckActivity key={client.id} client={client} open={activityOpen} hidden={false} onOpen={()=>setActivityOpen(true)} onClose={()=>setActivityOpen(false)} onCard={id=>{window.location.href=`/admin/production?card=${encodeURIComponent(id)}`;}}/>}
  </>;
}
