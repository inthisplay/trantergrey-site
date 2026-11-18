'use client';
import { useEffect,useRef,useState } from 'react';
import { UiIcon } from './UiIcon';
import { hqRequest } from './ClientHQ';
import { ClientDriveConnection } from './ClientDriveConnection';
import { ClientDriveTree } from './ClientDriveTree';
import { ClientDrivePreview } from './ClientDrivePreview';
import styles from './ClientHQ.module.css';
type FileItem={id:string;name:string;mimeType:string;hasThumbnail?:boolean;webViewLink?:string};
type FolderPin={folder_id:string;root_id:string;name:string;position:number};
type Client={id:string;name?:string;drive_folder_id:string|null;drive_managed_folder_id?:string|null;extra_folders?:{folder_id:string;name:string}[]};
const folderType='application/vnd.google-apps.folder';
function UploadHint({disabled,onFiles}:{disabled:boolean;onFiles:(files:File[])=>void}) {
  const input=useRef<HTMLInputElement>(null);
  return <p className={styles.uploadHint}>drop files here or <button type="button" disabled={disabled} onClick={()=>input.current?.click()}>choose files</button><input ref={input} type="file" multiple hidden aria-label="Choose files to upload" disabled={disabled} onChange={e=>{onFiles(Array.from(e.target.files || []));e.target.value='';}}/></p>;
}
function DrivePreview({file,client,root}:{file:FileItem;client:string;root:string}) {
  const [failed,setFailed]=useState(false);
  return file.hasThumbnail && !failed?<img className={styles.drivePreview} alt="" loading="lazy" onError={()=>setFailed(true)} src={`/api/admin/client-hq-drive?client=${client}&root=${root}&thumbnail=${file.id}`}/>:<span className={styles.drivePreviewFallback}><UiIcon name="quote"/><small>Preview unavailable</small></span>;
}
export function ClientDrive({client,onChange}:{client:Client;onChange:()=>Promise<void>}){
  const [connected,setConnected]=useState<boolean|null>(null),[picking,setPicking]=useState(!client.drive_folder_id),[addingExtra,setAddingExtra]=useState(false),[root,setRoot]=useState('');
  const [settings,setSettings]=useState(false),[path,setPath]=useState<{id:string;name:string}[]>([]);
  const [preview,setPreview]=useState<FileItem|null>(null);
  const [uploading,setUploading]=useState(false),[dragging,setDragging]=useState(false);
  const [uploadProgress,setUploadProgress]=useState<{percent:number|null;saving:boolean}|null>(null);
  const [pins,setPins]=useState<FolderPin[]>([]),[pinBusy,setPinBusy]=useState(false),[pinError,setPinError]=useState('');
  useEffect(()=>{let active=true;hqRequest(`/api/admin/client-drive-pins?client=${client.id}`).then(data=>{if(active)setPins(data.pins);}).catch(e=>{if(active)setPinError(e.message);});return()=>{active=false;};},[client.id,client.drive_folder_id,client.extra_folders]);
  async function updatePin(action:string,folder:string,options:{root?:string;name?:string;direction?:string}={}){
    setPinBusy(true);setPinError('');
    try{const data=await hqRequest(`/api/admin/client-drive-pins?client=${client.id}`,{action,folder,...options});setPins(data.pins);}
    catch(e){setPinError((e as Error).message);}finally{setPinBusy(false);}
  }
  function openPin(pin:FolderPin){setRoot(pin.root_id);setOpeningFolder(pin.folder_id);setExpanded(true);}
  function renamePin(pin:FolderPin){const name=prompt('Shortcut name',pin.name);if(name!==null)void updatePin('rename',pin.folder_id,{name});}
  function removePin(pin:FolderPin){if(confirm(`Remove “${pin.name}” from pinned folders? The folder and its files will stay in Google Drive.`))void updatePin('remove',pin.folder_id);}
  const uploadLock=useRef(false);
  const dragDepth=useRef(0);
  const [expanded,setExpanded]=useState(false),[openingFolder,setOpeningFolder]=useState('');
  const explorerDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(!expanded)return;const el=explorerDialog.current!;const trigger=document.activeElement as HTMLElement;const overflow=document.body.style.overflow;el.showModal();document.body.style.overflow='hidden';return()=>{el.close();document.body.style.overflow=overflow;trigger?.focus();};},[expanded]);
  function closeExplorer(){if(uploadLock.current)return;setExpanded(false);setRoot('');setOpeningFolder('');}
  function openFolder(id:string){if(!expanded && !picking){setOpeningFolder(id);setExpanded(true);}else void browse(id);}
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(!settings)return;const el=dialog.current!;const trigger=document.activeElement as HTMLElement;const overflow=document.body.style.overflow;el.showModal();document.body.style.overflow='hidden';return()=>{el.close();document.body.style.overflow=overflow;trigger?.focus();};},[settings]);
  const [files,setFiles]=useState<FileItem[]>([]),[trail,setTrail]=useState<{id:string;name:string}[]>([]),[page,setPage]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[search,setSearch]=useState('');
  const requestId=useRef(0);
  const selectedRoot=root || client.drive_folder_id || '';
  const primary=selectedRoot===client.drive_folder_id;
  const rootName=primary?'Primary client folder':client.extra_folders?.find(f=>f.folder_id===root)?.name || 'Client folder';
  async function browse(folder='',next='',append=false){
    const current=++requestId.current;setBusy(true);setError('');
    try{
      const params=new URLSearchParams({folder,page:next});
      if(!picking){params.set('client',client.id);params.set('root',selectedRoot);}
      if(!picking && !expanded && !settings)params.set('managed','1');
      const d=await hqRequest(`/api/admin/client-hq-drive?${params}`);
      if(current!==requestId.current)return;
      setFiles(old=>append?[...old,...d.files]:d.files);setPage(d.nextPageToken || '');setPath(d.path || []);
    }catch(e){if(current===requestId.current){setFiles([]);setPath([]);setError((e as Error).message);}}
    finally{if(current===requestId.current)setBusy(false);}
  }
  useEffect(()=>{setFiles([]);setPath([]);if(connected){setTrail([]);setSearch('');void browse(expanded?openingFolder:'');setOpeningFolder('');}else{requestId.current++;}},[connected,picking,client.drive_folder_id,root,expanded,settings]);
  async function link(folder?:string){
    const selectedPath=path.map(f=>f.name).join(' / ');
    if(!confirm(folder?`Link “${selectedPath}” as this client’s ${addingExtra?'additional':'primary'} folder?${addingExtra?'':' New uploads will go into its Client HQ subfolder.'}`:`Create “${client.name || 'New client'} / Client HQ” in TranterGrey Media?`))return;
    setBusy(true);setError('');
    try{
      await hqRequest(`/api/admin/client-hq-drive?client=${client.id}`,folder?{action:addingExtra?'link-extra':'link',folder}:{action:'create-folder'});
      await onChange();setRoot(addingExtra && folder?folder:'');setPicking(false);setTrail([]);setMessage('Client folder linked.');
    }catch(e){setError((e as Error).message);await onChange();}
    finally{setBusy(false);}
  }
  async function unlinkExtra(){
    if(!confirm(`Remove the “${rootName}” link from this workspace? Files in Drive will remain untouched.`))return;
    setBusy(true);setError('');
    try{await hqRequest(`/api/admin/client-hq-drive?client=${client.id}`,{action:primary?'unlink-primary':'unlink-extra',folder:selectedRoot});await onChange();setRoot('');if(primary){setAddingExtra(false);setPicking(true);}setMessage('Folder link removed. Nothing was deleted from Google Drive.');}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  function closeSettings(){if(uploadLock.current)return;setSettings(false);setRoot('');if(client.drive_folder_id)setPicking(false);}
  async function uploadFiles(selected:File[]){
    if(!selected.length || uploadLock.current || busy || !connected || !client.drive_folder_id)return;
    if(selected.some(file=>file.size>20*1024*1024 || !file.size)){setError('Choose non-empty files up to 20 MB each. Larger files can be uploaded in Google Drive.');return;}
    uploadLock.current=true;setUploading(true);setError('');let saved=0,folder='',failure='';
    try{
      for(const file of selected){
        setMessage(`Uploading ${saved+1} of ${selected.length}: ${file.name}`);
        setUploadProgress({percent:0,saving:false});
        const body=new FormData();body.append('file',file);
        const data=await new Promise<{folder:{id:string}}>((resolve,reject)=>{
          const xhr=new XMLHttpRequest();
          xhr.open('POST',`/api/admin/client-hq-drive?client=${client.id}`);
          xhr.timeout=180000;
          xhr.upload.onprogress=e=>setUploadProgress({percent:e.lengthComputable?Math.min(100,Math.round(e.loaded/e.total*100)):null,saving:false});
          xhr.upload.onload=()=>setUploadProgress({percent:100,saving:true});
          xhr.onerror=()=>reject(new Error('Upload connection lost. Check Google Drive before retrying.'));
          xhr.ontimeout=()=>reject(new Error('Upload took too long. Check Google Drive before retrying.'));
          xhr.onabort=()=>reject(new Error('Upload cancelled.'));
          xhr.onload=()=>{
            let result;
            try{result=JSON.parse(xhr.responseText);}catch{reject(new Error('The upload service is unavailable. Check Google Drive before retrying.'));return;}
            if(xhr.status<200 || xhr.status>=300){reject(new Error(result.error || `Could not upload ${file.name}.`));return;}
            resolve(result);
          };
          xhr.send(body);
        });
        saved++;folder=data.folder.id;
      }
    }catch(e){failure=(e as Error).message;}
    finally{
      if(saved)await browse(expanded?folder:'');
      setMessage(saved?`${saved} ${saved===1?'file':'files'} uploaded.`:'');
      if(failure)setError(failure);
      setUploading(false);setUploadProgress(null);uploadLock.current=false;
    }
  }
  const canDrop=Boolean(connected && client.drive_folder_id && !picking && !settings && !expanded && !preview && !busy && !uploading);
  const dropHandlers={
    onDragEnter:(e:React.DragEvent)=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth.current++;if(canDrop)setDragging(true);}},
    onDragOver:(e:React.DragEvent)=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect=canDrop?'copy':'none';}},
    onDragLeave:()=>{dragDepth.current=Math.max(0,dragDepth.current-1);if(!dragDepth.current)setDragging(false);},
    onDrop:(e:React.DragEvent)=>{e.preventDefault();dragDepth.current=0;setDragging(false);if(canDrop)void uploadFiles(Array.from(e.dataTransfer.files));},
  };
  const pinManagement=<section className={styles.pinManagement}><h3>Pinned folders</h3><p>Pin folders while browsing Google Drive. These shortcuts are shared with your team.</p>{pins.map((pin,index)=><div key={pin.folder_id} className={styles.pinSetting}><span>{pin.name}</span><div><button disabled={pinBusy || index===0} aria-label={`Move ${pin.name} up`} onClick={()=>void updatePin('move',pin.folder_id,{direction:'up'})}>↑</button><button disabled={pinBusy || index===pins.length-1} aria-label={`Move ${pin.name} down`} onClick={()=>void updatePin('move',pin.folder_id,{direction:'down'})}>↓</button><button disabled={pinBusy} onClick={()=>renamePin(pin)}>Rename</button><button disabled={pinBusy} onClick={()=>removePin(pin)}>Remove</button></div></div>)}</section>;
  const controls=<>
    <ClientDriveConnection client={client.id} onStatus={setConnected}/>
    {pinManagement}
    <h3>Folders for {client.name || 'this client'}</h3>
    {connected && <>
      {!picking && client.drive_folder_id && <label className={styles.search}>Linked folder<select value={selectedRoot} onChange={e=>setRoot(e.target.value)} disabled={busy}><option value={client.drive_folder_id}>Primary folder</option>{client.extra_folders?.map(f=><option key={f.folder_id} value={f.folder_id}>{f.name}</option>)}</select><span className={styles.folderPath}>{path.map(f=>f.name).join(' / ')}</span></label>}
      {client.drive_folder_id && <div className={styles.actions}>
        <button disabled={busy} onClick={()=>{setAddingExtra(false);setPicking(!picking);}}>{picking?'Back to files':'Change primary folder'}</button>
        {!picking && <button disabled={busy} onClick={()=>{setAddingExtra(true);setPicking(true);}}>Add another folder</button>}
        {!picking && <button disabled={busy} onClick={()=>void unlinkExtra()}>Remove {primary?'primary ':''}folder link</button>}
      </div>}
      <p>{picking?`Choose the exact ${addingExtra?'additional':'primary'} client folder in TranterGrey Media.`:'New uploads are saved in the primary folder’s Client HQ subfolder. Existing files stay where they are.'}</p>
      <p>Link an existing client folder to browse it here. Linking does not move its files. The primary folder gets a Client HQ subfolder for new uploads; additional folders are for browsing.</p>
    </>}
  </>;
  const browser=<>
      {!picking && expanded && Boolean(client.extra_folders?.length) && <div className={styles.actions}>
        <button disabled={busy} aria-pressed={primary} onClick={()=>setRoot('')}>Primary folder</button>
        {client.extra_folders?.map(f=><button key={f.folder_id} disabled={busy} aria-pressed={selectedRoot===f.folder_id} onClick={()=>setRoot(f.folder_id)}>{f.name}</button>)}
      </div>}
      {(picking || expanded) && <nav className={picking?styles.folderHierarchy:styles.driveCrumbs} aria-label="Folder hierarchy">{path.filter((f,i)=>picking || i>=path.findIndex(p=>p.id===selectedRoot)).map((f,i)=><div key={f.id} style={picking?{paddingLeft:Math.min(i,8)*18}:undefined}><button disabled={busy} aria-current={f.id===path.at(-1)?.id?'location':undefined} onClick={()=>{setSearch('');void browse(f.id);}}><UiIcon name="chevronRight"/>{f.name}</button></div>)}</nav>}
      {!picking && expanded && path.length>0 && <div className={styles.pinFolderAction}><button disabled={busy || pinBusy || pins.some(p=>p.folder_id===path.at(-1)!.id)} onClick={()=>void updatePin('pin',path.at(-1)!.id,{root:selectedRoot})}><UiIcon name="plus"/>{pins.some(p=>p.folder_id===path.at(-1)!.id)?'Folder pinned':'Pin folder'}</button></div>}
      {picking ? <>
        <p className={styles.folderPath}>{path.map(f=>f.name).join(' / ')}</p>
        <div className={styles.actions}>{path.length>1 && <><button disabled={busy} onClick={()=>void link(path.at(-1)!.id)}>Link “{path.at(-1)!.name}” as {addingExtra?'additional':'primary'} folder</button><a href={`https://drive.google.com/drive/folders/${path.at(-1)!.id}`} target="_blank" rel="noreferrer">Inspect in Drive <UiIcon name="external"/></a></>}{!client.drive_folder_id && <button disabled={busy} onClick={()=>void link()}>Create new client folder</button>}</div>
        <label className={styles.search}>Subfolders of {path.at(-1)?.name || 'TranterGrey Media'}<input type="search" placeholder="Filter these subfolders…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <p>Open a subfolder below to explore it, or link the current folder above.</p>
      </> : null}
      {busy && <p role="status">Loading…</p>}
      <div className={picking?styles.folderList:styles.files}>{files.filter(f=>!picking || f.name.toLowerCase().includes(search.toLowerCase())).map(f=><div key={f.id}>{f.mimeType===folderType?<button disabled={busy} onClick={()=>{setTrail([...trail,{id:f.id,name:f.name}]);setSearch('');openFolder(f.id);}}><UiIcon name="folder"/><strong>{f.name}</strong><small>{picking?'Open subfolder':'Folder'}</small></button>:<button aria-haspopup="dialog" aria-label={`Preview ${f.name}`} onClick={()=>setPreview(f)}><DrivePreview key={`${selectedRoot}:${f.id}`} file={f} client={client.id} root={selectedRoot}/><strong>{f.name}</strong><small>{f.mimeType.split('.').at(-1)?.split('/').at(-1)} <UiIcon name="external"/></small></button>}</div>)}</div>
      {!busy && !error && !files.length && <p>This folder is empty.</p>}
      {page && <button disabled={busy} onClick={()=>void browse(path.at(-1)?.id || '',page,true)}>Load more</button>}
    </>;
  return <section id="workspace-files" className={`${styles.panel} ${styles.drivePanel} ${styles.panelDropZone}`} aria-label="Docs & files" data-dragging={dragging || undefined} {...dropHandlers}>
    <p className={styles.eyebrow}>Google Drive</p>
    {preview && <ClientDrivePreview file={preview} onClose={()=>setPreview(null)}/>}
    <div className={styles.sectionHeading}><h2>Docs & files</h2><button disabled={uploading} aria-label="Docs and files settings" title="Docs and files settings" onClick={()=>setSettings(true)}><UiIcon name="settings"/></button></div>
    {!settings && !expanded && pinError && <p role="alert" className={styles.error}>{pinError}</p>}
    {!settings && error && <div className={styles.error} role="alert">{error} <button disabled={busy || uploading} onClick={()=>void browse(path[path.length-1]?.id || '')}>Refresh files</button></div>}
    {connected && !picking && !expanded && <div className={styles.uploadDropArea}><UploadHint disabled={busy || uploading} onFiles={selected=>void uploadFiles(selected)}/>{message && <p role="status" className={styles.connectionHint}>{message}</p>}{uploadProgress && <div className={styles.uploadProgress}><progress max={100} value={uploadProgress.saving?undefined:uploadProgress.percent??undefined} aria-label={uploadProgress.saving?'Saving to Google Drive':'File upload progress'}/><span role="status">{uploadProgress.saving?'Saving to Google Drive…':uploadProgress.percent===null?'Uploading…':`${uploadProgress.percent}% uploaded`}</span></div>}<nav className={styles.pinnedFolders} aria-label="Pinned Drive folders">{pins.length?pins.map(pin=><button key={pin.folder_id} disabled={busy || uploading} onClick={()=>openPin(pin)} title={pin.name}><UiIcon name="folder"/>{pin.name}</button>):<p>Pin frequently used folders from the Google Drive browser.</p>}</nav><div className={`${styles.driveContents} ${styles.uploadFileList}`}>{browser}</div></div>}
    {client.drive_folder_id && <button disabled={uploading} className={styles.expandPanel} aria-haspopup="dialog" onClick={()=>{setOpeningFolder('');setExpanded(true);}}><UiIcon name="external"/>{client.name || 'Client'} on Google Drive</button>}
    <dialog ref={explorerDialog} className={`${styles.noteModal} ${styles.driveModal}`} aria-labelledby={`drive-explorer-${client.id}`} onCancel={e=>{e.preventDefault();closeExplorer();}}>
      <header><div><p>{client.name}</p><h2 id={`drive-explorer-${client.id}`}>Docs & files</h2></div><button aria-label="Close files explorer" onClick={closeExplorer}><UiIcon name="close"/></button></header>
      {expanded && <div className={styles.driveModalBody}>{pinError && <p role="alert" className={styles.error}>{pinError}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.driveExplorer}><ClientDriveTree key={selectedRoot} client={client.id} root={{id:selectedRoot,name:path.find(f=>f.id===selectedRoot)?.name || rootName}} path={path.slice(Math.max(0,path.findIndex(f=>f.id===selectedRoot)))} onSelect={id=>void browse(id)}/><div className={styles.driveContents}>{browser}</div></div></div>}
    </dialog>
    {(!connected || picking) && <button onClick={()=>setSettings(true)}>{connected?'Choose client folder':'Set up Google Drive'}</button>}
    <dialog ref={dialog} className={styles.noteModal} aria-labelledby={`drive-settings-${client.id}`} onCancel={e=>{e.preventDefault();closeSettings();}}>
      <header><h2 id={`drive-settings-${client.id}`}>Docs & files settings</h2><button aria-label="Close file settings" onClick={closeSettings}><UiIcon name="close"/></button></header>
      <div className={styles.driveSettings}>{controls}{pinError && <p role="alert" className={styles.error}>{pinError}</p>}{error && <p className={styles.error} role="alert">{error}</p>}{message && <p role="status">{message}</p>}{connected && picking && browser}</div>
    </dialog>
  </section>;
}
