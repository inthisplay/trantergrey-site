'use client';

import { compressVideo } from '@/lib/compress-video';
import { MAX_UPLOAD_BYTES, uploadContentType, uploadRolodexFile, uploadValidation } from '@/lib/rolodex-upload';
import { RolodexEthnicitySelect } from './RolodexEthnicitySelect';
import { ethnicityOptions } from '@/lib/rolodex-ethnicity';
import { genderOptions, normalizedGender } from '@/lib/rolodex-gender';
import { mediaVariantUrl, mediaPosterUrl } from '@/lib/media-preview';
import { useEffect, useRef, useState } from 'react';
import { castingAge, withRolodexCatalogChange, subscribeRolodexCatalog, rolodexMutation, rolodexRequest, type Talent, type TalentMedia, type TalentHistory } from '@/lib/rolodex';
import { AddTalentToCard, RolodexModal } from './RolodexDialogs';
import styles from './Rolodex.module.css';

function Face({person}:{person:Talent}) { return person.cover ? <img src={mediaVariantUrl(person.cover.url, person.cover.contentType?.startsWith('video/') ? 'poster' : 'thumb')} alt="" loading="lazy"/> : <span className={styles.initials}>{person.name.split(/\s+/).map(n=>n[0]).slice(0,2).join('')}</span>; }
export function Rolodex({teamApp=false}:{teamApp?:boolean}) {
 const [people,setPeople]=useState<Talent[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [query,setQuery]=useState(''),[filters,setFilters]=useState(false),[gender,setGender]=useState(''),[ethnicity,setEthnicity]=useState(''),[tag,setTag]=useState(''),[minAge,setMinAge]=useState(''),[maxAge,setMaxAge]=useState(''),[archived,setArchived]=useState(false);
 const [current,setCurrent]=useState<string|null>(null),[selecting,setSelecting]=useState(false),[selected,setSelected]=useState<string[]>([]),[cardPicker,setCardPicker]=useState(false),[creating,setCreating]=useState(false),[newName,setNewName]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const d=await rolodexRequest();setPeople(d.people);}
 useEffect(()=>{let active=true;const reload=()=>{rolodexRequest().then(d=>{if(active){setPeople(d.people);setError('');}}).catch(e=>{if(active){setPeople([]);setError(e.message);}}).finally(()=>{if(active)setLoading(false);});};reload();const unsubscribe=subscribeRolodexCatalog(reload);const id=new URLSearchParams(window.location.search).get('person');if(id)setCurrent(id);return()=>{active=false;unsubscribe();};},[]);
 const shown=people.filter(p=>Boolean(p.archivedAt)===archived && `${p.name} ${p.tags.join(' ')} ${p.ethnicity} ${p.gender}`.toLowerCase().includes(query.toLowerCase()) && (!gender||p.gender===gender)&&(!ethnicity||(ethnicity==='not-provided'?!p.ethnicities.length:p.ethnicities.includes(ethnicity)))&&(!tag||p.tags.includes(tag))&&(!minAge||castingAge(p)!==null&&castingAge(p)!>=Number(minAge))&&(!maxAge||castingAge(p)!==null&&castingAge(p)!<=Number(maxAge)));
 const genders=genderOptions,ethnicities=ethnicityOptions,tags=[...new Set(people.flatMap(p=>p.tags))].sort();
 const navigationGuard=useRef<()=>Promise<boolean>>(async()=>true);
 const navigationSequence=useRef(0);
 const workspaceRef=useRef<HTMLElement>(null);
 const stripRef=useRef<HTMLElement>(null);
 async function choosePerson(id:string|null){
  if(id===current)return;
  const sequence=++navigationSequence.current;
  if(await navigationGuard.current() && sequence===navigationSequence.current)setCurrent(id);
 }
 useEffect(()=>{
  const workspace=workspaceRef.current;if(!workspace)return;
  const nav=document.querySelector<HTMLElement>('nav[aria-label="Team app"]');
  const measure=()=>{
   workspace.style.setProperty('--rolodex-top',`${Math.max(0,workspace.getBoundingClientRect().top)}px`);
   workspace.style.setProperty('--rolodex-nav-height',`${nav?.getBoundingClientRect().height||0}px`);
  };
  const observer=new ResizeObserver(measure);if(nav)observer.observe(nav);
  window.addEventListener('resize',measure);measure();
  return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
 },[current,teamApp]);
 useEffect(()=>{
  const strip=stripRef.current;const active=strip?.querySelector<HTMLElement>('[aria-current="true"]');
  if(strip&&active)strip.scrollTo({left:active.offsetLeft-(strip.clientWidth-active.offsetWidth)/2,behavior:'smooth'});
 },[current,shown.map(p=>p.id).join(',')]);
 const index=shown.findIndex(p=>p.id===current);
 function toggle(id:string){setSelected(ids=>ids.includes(id)?ids.filter(i=>i!==id):[...ids,id]);}
 async function create(){setBusy(true);setError('');try{const d=await rolodexMutation({action:'create',name:newName});await load();setCreating(false);setNewName('');void choosePerson(d.id);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section ref={workspaceRef} className={`${styles.workspace} ${teamApp?styles.team:''} ${current?styles.split:''}`}><div className={styles.browserPane}><header className={styles.header}><div><p className={styles.eyebrow}>TranterGrey · People</p><h1>The Rolodex</h1></div><div className={styles.actions}><button type="button" aria-pressed={selecting} onClick={()=>{setSelecting(!selecting);setSelected([]);}}>{selecting?'Done selecting':'Select'}</button><button className={styles.primary} type="button" onClick={()=>{setError('');setCreating(true);}}>Add person</button></div></header>
 <div className={styles.searchBar}><input aria-label="Search The Rolodex" placeholder="Search names or tags…" value={query} onChange={e=>setQuery(e.target.value)}/><button type="button" aria-expanded={filters} onClick={()=>setFilters(!filters)}>Filters{[gender,ethnicity,tag,minAge,maxAge].filter(Boolean).length?` (${[gender,ethnicity,tag,minAge,maxAge].filter(Boolean).length})`:''}</button><button type="button" aria-pressed={archived} onClick={()=>{setArchived(!archived);setSelected([]);}}>{archived?'Archived':'View archived'}</button></div>
 {filters&&<div className={styles.filters}><label>Age from<input type="number" min="0" max="130" value={minAge} onChange={e=>setMinAge(e.target.value)}/></label><label>Age to<input type="number" min="0" max="130" value={maxAge} onChange={e=>setMaxAge(e.target.value)}/></label><label>Race / ethnicity<select value={ethnicity} onChange={e=>setEthnicity(e.target.value)}><option value="">All</option><option value="not-provided">Not provided</option>{ethnicities.map(t=><option key={t}>{t}</option>)}</select></label><label>Gender<select value={gender} onChange={e=>setGender(e.target.value)}><option value="">All</option>{genders.map(t=><option key={t}>{t}</option>)}</select></label><label>Tag<select value={tag} onChange={e=>setTag(e.target.value)}><option value="">All</option>{tags.map(t=><option key={t}>{t}</option>)}</select></label><button type="button" onClick={()=>{setMinAge('');setMaxAge('');setEthnicity('');setGender('');setTag('');}}>Clear filters</button></div>}
 {selecting&&<div className={styles.selectionBar}><span>{selected.length} selected</span><button type="button" onClick={()=>setSelected(shown.filter(p=>!p.archivedAt).map(p=>p.id))}>Select visible</button><button type="button" onClick={()=>setSelected([])}>Clear</button><button type="button" disabled={!selected.length||archived} onClick={()=>setCardPicker(true)}>Add to Deck card</button></div>}
 {error&&<p role="alert" className={styles.error}>{error}</p>}{message&&<p role="status">{message}</p>}
 <p className={styles.count}>{shown.length} {archived?'archived ':''}{shown.length===1?'person':'people'}</p>
 {loading?<p>Loading The Rolodex…</p>:shown.length===0?<div className={styles.empty}>{people.length?'No people match these filters.':'Start with a name and a photo. Add a person here or save someone from Casting.'}</div>:<div className={styles.grid}>{shown.map(p=><button type="button" className={`${styles.person} ${selected.includes(p.id)||current===p.id?styles.selected:''}`} key={p.id} aria-pressed={selecting?selected.includes(p.id):undefined} aria-current={current===p.id?'true':undefined} onClick={()=>selecting?toggle(p.id):void choosePerson(p.id)}><div className={styles.face}><Face person={p}/>{selecting&&<span className={styles.check}>{selected.includes(p.id)?'✓':''}</span>}</div><strong>{p.name}</strong></button>)}</div>}
 </div>
 {current&&<TalentPanel key={current} id={current} previous={index>0?shown[index-1].id:null} next={index>=0&&index<shown.length-1?shown[index+1].id:null} onNavigate={setCurrent} navigationGuard={navigationGuard} onChanged={()=>void load().catch(e=>setError(e.message))}/>}
 {current&&<nav ref={stripRef} className={styles.faceStrip} aria-label="Browse filtered people">{shown.map(p=><button type="button" key={p.id} aria-current={current===p.id?'true':undefined} onClick={()=>void choosePerson(p.id)}><div className={styles.stripFace}><Face person={p}/></div><span>{p.name}</span></button>)}{!shown.length&&<p>No people match your filters. Return to the grid to change them.</p>}</nav>}
 {cardPicker&&<AddTalentToCard personIds={selected} onClose={()=>setCardPicker(false)} onAdded={text=>{setMessage(text);setCardPicker(false);setSelected([]);setSelecting(false);}}/>}
 {creating&&<RolodexModal title="Add a person" onClose={()=>setCreating(false)} busy={busy}><form onSubmit={e=>{e.preventDefault();void create();}}><label>Name<input autoFocus required maxLength={180} value={newName} onChange={e=>setNewName(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}{newName.trim()&&people.some(p=>p.name.toLowerCase().includes(newName.trim().toLowerCase()))&&<div className={styles.results}><p>Possibly already in The Rolodex:</p>{people.filter(p=>p.name.toLowerCase().includes(newName.trim().toLowerCase())).slice(0,6).map(p=><button key={p.id} type="button" onClick={()=>{setCreating(false);void choosePerson(p.id);}}>{p.name}{p.archivedAt?' (archived)':''}</button>)}</div>}<button className={styles.primary} disabled={busy||!newName.trim()}>{busy?'Creating…':'Create person'}</button></form></RolodexModal>}
 </section>;
}

type UploadItem={id:string;file:File;loaded:number;phase:'queued'|'compressing'|'uploading'|'saving'|'success'|'failed';message:string};
type Detail={person:Talent;media:TalentMedia[];history:TalentHistory[]};
function TalentPanel({id,previous,next,onNavigate,onChanged,navigationGuard}:{id:string;previous:string|null;next:string|null;onNavigate:(id:string|null)=>void;onChanged:()=>void;navigationGuard:React.MutableRefObject<()=>Promise<boolean>>}) {
 const [detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState('');
 useEffect(()=>{navigationGuard.current=async()=>true;let active=true;rolodexRequest(`?id=${encodeURIComponent(id)}`).then(d=>{if(active)setDetail(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;navigationGuard.current=async()=>true;};},[id]);
 return <aside className={styles.drawer} aria-label="Rolodex profile">{detail?<Profile detail={detail} previous={previous} next={next} onNavigate={onNavigate} onChanged={onChanged} onDetail={setDetail} navigationGuard={navigationGuard}/>:<><button type="button" onClick={()=>onNavigate(null)}>Back to grid</button><p role={error?'alert':'status'}>{error||'Opening profile…'}</p></>}</aside>;
}
function Profile({detail,previous,next,onNavigate,onChanged,onDetail,navigationGuard}:{detail:Detail;previous:string|null;next:string|null;onNavigate:(id:string|null)=>void;onChanged:()=>void;onDetail:(d:Detail)=>void;navigationGuard:React.MutableRefObject<()=>Promise<boolean>>}) {
 const p=detail.person;
 const initial={name:p.name,age:castingAge(p)?.toString()??'',ethnicities:p.ethnicities,gender:normalizedGender(p.gender),tags:p.tags.join(', '),email:p.email,phone:p.phone,notes:p.notes};
 const [form,setForm]=useState(initial),[status,setStatus]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState<TalentMedia|null>(null),[mux,setMux]=useState(false),[confirm,setConfirm]=useState<'delete'|TalentMedia|null>(null),[cardPicker,setCardPicker]=useState(false),[message,setMessage]=useState('');
 const [uploads,setUploads]=useState<UploadItem[]>([]);
 const uploading=useRef(false),uploadAbort=useRef<AbortController|null>(null);
 useEffect(()=>()=>uploadAbort.current?.abort(),[]);
 useEffect(()=>{if(!busy)return;const warn=(event:BeforeUnloadEvent)=>{if(uploading.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
 const draft=useRef(initial),saved=useRef(JSON.stringify(initial)),timer=useRef<ReturnType<typeof setTimeout>|null>(null),inFlight=useRef<Promise<boolean>|null>(null),input=useRef<HTMLInputElement>(null);
 async function flush():Promise<boolean>{
  if(timer.current)clearTimeout(timer.current);
  if(inFlight.current){if(!await inFlight.current)return false;return flush();}
  const snapshot={...draft.current},key=JSON.stringify(snapshot);if(key===saved.current)return true;
  setStatus('Saving…');setError('');
  const promise=(async()=>{try{const previous=JSON.parse(saved.current) as typeof snapshot; const changes:Record<string,unknown>={}; for(const key of Object.keys(snapshot) as (keyof typeof snapshot)[]){if(JSON.stringify(snapshot[key])===JSON.stringify(previous[key]))continue;changes[key]=key==='tags'?snapshot.tags.split(',').map(t=>t.trim()).filter(Boolean):key==='age'?snapshot[key]===''?null:Number(snapshot[key]):snapshot[key];} await rolodexMutation({action:'update',id:p.id,...changes});saved.current=key;setStatus('Saved');onChanged();return true;}catch(e){setError((e as Error).message);setStatus('Not saved');return false;}})();
  inFlight.current=promise;const ok=await promise;inFlight.current=null;
  return ok&&JSON.stringify(draft.current)!==key?flush():ok;
 }
 function update<K extends keyof typeof form>(key:K,value:(typeof form)[K]){draft.current={...draft.current,[key]:value};setForm(draft.current);setStatus('Unsaved');if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),750);}
 async function navigate(id:string|null){if(busy)return;if(await flush())onNavigate(id);}
 navigationGuard.current=()=>busy?Promise.resolve(false):flush();
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 async function refresh(){onDetail(await rolodexRequest(`?id=${p.id}`));onChanged();}
 async function mutate(body:object){setBusy(true);setError('');try{if(!await flush())return;await rolodexMutation({id:p.id,...body});await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function processUploads(items:UploadItem[]){
  if(uploading.current||busy)return;
  uploading.current=true;setBusy(true);setError('');setMessage('');
  const patch=(id:string,change:Partial<UploadItem>)=>setUploads(current=>current.map(item=>item.id===id?{...item,...change}:item));
  let succeeded=0;
  try {
   if(!await flush()){for(const item of items)patch(item.id,{phase:'failed',message:'Profile edits could not be saved. Resolve the profile error, then retry.'});return;}
   await withRolodexCatalogChange(async()=>{
    for(const item of items){
     const controller=new AbortController();uploadAbort.current=controller;
     patch(item.id,{phase:'uploading',loaded:0,message:''});
     try {
      let file=item.file;
      if(file.size>MAX_UPLOAD_BYTES&&uploadContentType(file).startsWith('video/')){
       patch(item.id,{phase:'compressing',loaded:0,message:''});
       file=await compressVideo(file,progress=>patch(item.id,{loaded:item.file.size*progress}),controller.signal);
       // Retry the compressed copy without recompressing; original file on disk is untouched.
       patch(item.id,{file,loaded:0,phase:'uploading'});
      }
      const invalid=uploadValidation(file);if(invalid)throw new Error(invalid);
      await uploadRolodexFile(p.id,file,item.id,progress=>patch(item.id,{phase:progress.phase,loaded:progress.loaded}),controller.signal);
      succeeded++;patch(item.id,{phase:'success',loaded:file.size,message:'Uploaded successfully. Preview may take a moment to appear.'});
     }catch(e){patch(item.id,{phase:'failed',message:(e as Error).message});}
     finally{uploadAbort.current=null;}
    }
   });
   if(succeeded)setMessage(`${succeeded} ${succeeded===1?'file uploaded':'files uploaded'} successfully.`);
   try{await refresh();}catch{setError('The profile could not refresh. Successfully uploaded files are saved; reopen the profile to see them.');}
  }finally{uploading.current=false;setBusy(false);if(input.current)input.current.value='';}
 }
 async function upload(files:File[]){
  if(!files.length||busy||uploading.current)return;
  const items:UploadItem[]=files.map(file=>({id:crypto.randomUUID(),file,loaded:0,phase:'queued',message:''}));
  setUploads(items);await processUploads(items);
 }

 return <><header className={styles.drawerHeader}><div className={styles.actions}><button aria-label="Previous person" type="button" disabled={!previous||busy} onClick={()=>void navigate(previous)}>‹</button><button aria-label="Next person" type="button" disabled={!next||busy} onClick={()=>void navigate(next)}>›</button><span>{p.archivedAt?'Archived':'The Rolodex'}</span></div><button type="button" disabled={busy} onClick={()=>void navigate(null)}><span className={styles.desktopClose}>Close ×</span><span className={styles.mobileBack}>← Back to grid</span></button></header>
 <div className={styles.profile}><div className={styles.profileHeading}><div className={styles.cover}><Face person={p}/></div><div><label>Name<input aria-label="Person name" maxLength={180} value={form.name} onChange={e=>update('name',e.target.value)} onBlur={()=>void flush()}/></label><span role="status" className={styles.saveStatus}>{status}</span><button type="button" disabled={busy||!!p.archivedAt} onClick={()=>setCardPicker(true)}>Add to Deck card</button></div></div>
 {error&&<p role="alert" className={styles.error}>{error} {status==='Not saved'&&<button type="button" onClick={()=>void flush()}>Retry save</button>}</p>}{message&&<p role="status">{message}</p>}
 <div className={styles.fields}><label>Age estimate as of {new Date().getFullYear()}<input type="number" min="0" max="130" step="1" value={form.age} placeholder="Unknown" onChange={e=>update('age',e.target.value)} onBlur={()=>void flush()}/><small>Automatically advances each year.</small></label><RolodexEthnicitySelect value={form.ethnicities} onChange={value=>{update('ethnicities',value);void flush();}}/>{(['gender','email','phone'] as const).map(key=><label key={key}>{key[0].toUpperCase()+key.slice(1)}{key==='gender'?<span className={styles.selectWrap}><select className={styles.genderSelect} value={form.gender} onChange={e=>{update('gender',normalizedGender(e.target.value));void flush();}}>{genderOptions.map(value=><option key={value} value={value}>{value}</option>)}</select></span>:<input type={key==='email'?'email':key==='phone'?'tel':'text'} value={form[key]} placeholder="Optional" onChange={e=>update(key,e.target.value)} onBlur={()=>void flush()}/>}</label>)}</div>
 <label>Tags<input value={form.tags} placeholder="comedy, voiceover, Atlanta…" onChange={e=>update('tags',e.target.value)} onBlur={()=>void flush()}/><small>Separate tags with commas.</small></label><label>Notes<textarea value={form.notes} rows={3} maxLength={10000} onChange={e=>update('notes',e.target.value)} onBlur={()=>void flush()}/></label>
 <section className={styles.mediaSection} onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}} onDrop={e=>{e.preventDefault();void upload(Array.from(e.dataTransfer.files));}}><header><h2>Photos & auditions</h2><div className={styles.actions}><button type="button" disabled={busy} onClick={()=>input.current?.click()}>{uploading.current?(uploads.some(item=>item.phase==='compressing')?'Compressing…':uploads.some(item=>item.phase==='uploading'||item.phase==='saving')?'Uploading…':'Updating profile…'):busy?'Saving…':'Upload media'}</button><button type="button" disabled={busy} onClick={()=>setMux(true)}>Search Mux</button></div></header><input hidden ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime" onChange={e=>void upload(Array.from(e.target.files||[]))}/><p className={styles.hint}>Drop photos or videos here · Videos over 90 MB are compressed on your device before upload. Keep this tab open; your original stays unchanged.</p>
 {uploads.length>0&&<div className={styles.uploadQueue} aria-label="Upload progress">{uploads.map(item=><div className={styles.uploadItem} key={item.id}>
  <div className={styles.uploadHeading}><strong>{item.file.name}</strong><span>{(item.file.size/1024/1024).toFixed(1)} MB</span></div>
  <progress aria-label={`Upload progress for ${item.file.name}`} max={item.file.size||1} value={item.loaded}/>
  <div className={styles.uploadStatus} role={item.phase==='failed'?'alert':'status'}>{item.phase==='queued'?'Waiting to upload…':item.phase==='compressing'?`Compressing video on your device · ${Math.floor(item.loaded/(item.file.size||1)*100)}%`:item.phase==='uploading'?`Uploading · ${Math.floor(item.loaded/(item.file.size||1)*100)}%`:item.phase==='saving'?'Transfer complete · Saving to profile…':item.message}</div>
  {item.phase==='failed'&&<button type="button" disabled={busy} onClick={()=>void processUploads([item])}>Retry</button>}
  {(item.phase==='compressing'||item.phase==='uploading'||item.phase==='saving')&&<button type="button" onClick={()=>uploadAbort.current?.abort()}>Cancel upload</button>}
 </div>)}</div>}
 {!detail.media.length&&<p>No media yet. Add a photo to give this person a face in the grid.</p>}
 <div className={styles.mediaGrid}>{detail.media.map(m=><article key={m.id}><button className={styles.mediaThumb} type="button" aria-label={`Preview ${m.title}`} onClick={()=>setPreview(m)}>{m.kind==='mux'?m.thumbnailUrl?<img src={m.thumbnailUrl} alt=""/>:<span>Mux video</span>:m.contentType?.startsWith('video/')?<img src={mediaVariantUrl(m.url, 'poster')} alt="" loading="lazy"/>:<img src={mediaVariantUrl(m.url, 'thumb')} alt="" loading="lazy"/>}{(m.kind==='mux'||m.contentType?.startsWith('video/'))&&<i>▶</i>}</button><input aria-label={`Media title for ${m.title}`} key={m.title} defaultValue={m.title} maxLength={180} disabled={busy} onBlur={e=>{if(e.target.value!==m.title)void mutate({action:'renameMedia',mediaId:m.id,title:e.target.value});}}/><div className={styles.mediaActions}>{m.kind==='upload'&&<button type="button" disabled={busy||p.coverMediaId===m.id} onClick={()=>void mutate({action:'cover',mediaId:m.id})}>{p.coverMediaId===m.id?'Cover':'Set cover'}</button>}<button type="button" disabled={busy} onClick={()=>setConfirm(m)}>Remove</button></div>{m.sourceCardId&&<a className={styles.source} href={`/app/deck?card=${encodeURIComponent(m.sourceCardId)}`}>Source production ↗</a>}</article>)}</div></section>
 <section className={styles.history}><h2>Production history</h2>{detail.history.length?detail.history.map(h=><a key={h.cardId} href={`/app/deck?card=${encodeURIComponent(h.cardId)}`}><strong>{h.title}</strong><span>{h.tags.join(', ')}{h.approvedAt?' · Approved':''}</span></a>):<p>No linked productions yet.</p>}</section>
 <footer className={styles.actions}><button type="button" disabled={busy} onClick={()=>void mutate({action:'archive',archived:!p.archivedAt})}>{p.archivedAt?'Restore person':'Archive person'}</button><button type="button" disabled={busy} onClick={()=>setConfirm('delete')}>Delete person</button></footer></div>
 {preview&&<RolodexModal title={preview.title} onClose={()=>setPreview(null)}>{preview.kind==='mux'?<iframe className={styles.player} src={preview.url} title={preview.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen/>:preview.contentType?.startsWith('video/')?<video className={styles.player} src={preview.url} poster={mediaPosterUrl(preview.url)} preload="none" controls playsInline/>:<img className={styles.fullImage} src={mediaVariantUrl(preview.url, 'preview')} alt={preview.title}/>}<a href={preview.url} target="_blank" rel="noreferrer">{preview.kind==='upload'?'Open original file':'Open video'}</a></RolodexModal>}
 {mux&&<MuxTalentPicker onClose={()=>setMux(false)} onSelect={async assetId=>{await rolodexMutation({action:'mux',id:p.id,assetId});await refresh();}}/>}
 {cardPicker&&<AddTalentToCard personIds={[p.id]} onClose={()=>setCardPicker(false)} onAdded={message=>{setMessage(message);setCardPicker(false);void refresh();}}/>}
 {confirm&&<RolodexModal title={confirm==='delete'?'Delete this person?':'Remove this media?'} onClose={()=>setConfirm(null)} busy={busy}><p>{confirm==='delete'?'This removes the profile from The Rolodex. Existing Deck Casting items stay intact. You can archive instead to keep the profile available for later.':'This removes the media from this profile. Existing Casting items stay intact.'}</p><button type="button" disabled={busy} onClick={async()=>{if(confirm==='delete'){setBusy(true);try{if(!await flush())return;await rolodexMutation({action:'delete',id:p.id});onChanged();onNavigate(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}else{await mutate({action:'removeMedia',mediaId:confirm.id});setConfirm(null);}}}>Confirm {confirm==='delete'?'delete':'remove'}</button></RolodexModal>}
 </>;
}
function MuxTalentPicker({onClose,onSelect}:{onClose:()=>void;onSelect:(id:string)=>Promise<void>}) {
 const [query,setQuery]=useState(''),[assets,setAssets]=useState<{id:string;title:string;thumbnailUrl:string|null}[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[added,setAdded]=useState<string[]>([]);
 useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>{setLoading(true);fetch(`/api/mux/library?limit=30&query=${encodeURIComponent(query)}`,{signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);const ids=new Set(d.pageAssetIds);setAssets(d.assets.filter((a:{id:string})=>ids.has(a.id)).map((a:{id:string;title:string;thumbnailUrl:string|null})=>({...a,title:d.projects?.find((p:{variants:{assetId:string}[]})=>p.variants.some(v=>v.assetId===a.id))?.title||a.title})));setError('');}).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},250);return()=>{clearTimeout(timer);controller.abort();};},[query]);
 return <RolodexModal title="Add Mux videos" onClose={onClose} busy={busy}><input autoFocus aria-label="Search Mux videos" placeholder="Search video titles or clients…" value={query} onChange={e=>setQuery(e.target.value)}/>{error&&<p role="alert">{error}</p>}{loading?<p>Searching…</p>:<div className={styles.results}>{assets.map(a=><button type="button" key={a.id} disabled={busy||added.includes(a.id)} onClick={async()=>{setBusy(true);try{await onSelect(a.id);setAdded(ids=>[...ids,a.id]);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{a.thumbnailUrl&&<img src={a.thumbnailUrl} alt=""/>}<span>{a.title}</span><small>{added.includes(a.id)?'Added':'Add'}</small></button>)}{!assets.length&&<p>No videos found.</p>}</div>}</RolodexModal>;
}
