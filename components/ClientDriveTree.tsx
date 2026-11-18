'use client';
import { useEffect,useState } from 'react';
import { hqRequest } from './ClientHQ';
import { UiIcon } from './UiIcon';
import styles from './ClientHQ.module.css';
type Folder={id:string;name:string};
export function ClientDriveTree({client,root,path,onSelect}:{client:string;root:Folder;path:Folder[];onSelect:(id:string)=>void}) {
  const [expanded,setExpanded]=useState<Record<string,boolean>>({[root.id]:true});
  useEffect(()=>{setExpanded(old=>({...old,...Object.fromEntries(path.map(f=>[f.id,true]))}));},[path]);
  function branch(folder:Folder,depth=0){return <FolderBranch key={folder.id} client={client} root={root.id} folder={folder} depth={depth} expanded={expanded} selected={path.at(-1)?.id || root.id} toggle={id=>setExpanded(old=>({...old,[id]:!old[id]}))} onSelect={onSelect} branch={branch}/>;}
  return <nav className={styles.driveTree} aria-label="Client folders"><p>Folders</p>{branch(root)}</nav>;
}
function FolderBranch({client,root,folder,depth,expanded,selected,toggle,onSelect,branch}:{client:string;root:string;folder:Folder;depth:number;expanded:Record<string,boolean>;selected:string;toggle:(id:string)=>void;onSelect:(id:string)=>void;branch:(f:Folder,d:number)=>React.ReactNode}) {
  const [children,setChildren]=useState<Folder[]|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const open=Boolean(expanded[folder.id]);
  useEffect(()=>{
    if(!open || children)return;
    let active=true;
    async function load(){try{let page='';const folders:Folder[]=[];do{const params=new URLSearchParams({client,root,folder:folder.id,page,folders:'1'});const result=await hqRequest(`/api/admin/client-hq-drive?${params}`);if(!active)return;folders.push(...result.files);page=result.nextPageToken || '';}while(page);setChildren(folders);setError('');}catch{if(active)setError('Could not load folders.');}}
    void load();return()=>{active=false;};
  },[open,client,root,folder.id,retry,children]);
  return <div className={styles.treeBranch}>
    <div className={styles.treeRow} data-selected={selected===folder.id || undefined}>
      <button aria-label={`${open?'Collapse':'Expand'} ${folder.name}`} aria-expanded={open} onClick={()=>toggle(folder.id)} disabled={children?.length===0}><UiIcon name={open?'chevronDown':'chevronRight'}/></button>
      <button title={folder.name} aria-current={selected===folder.id?'location':undefined} onClick={()=>onSelect(folder.id)}><UiIcon name="folder"/><span>{folder.name}</span></button>
    </div>
    {open && <div className={styles.treeChildren}>{error?<button onClick={()=>{setError('');setRetry(x=>x+1);}}>Retry loading folders</button>:children?children.map(f=>depth<50?branch(f,depth+1):null):<small>Loading…</small>}</div>}
  </div>;
}
