import type { AdminEnvironment } from './admin';
import { connectionStatus,decryptDriveSecret,sharedDriveId } from './client-drive-oauth';
export const folderType = 'application/vnd.google-apps.folder';
export type DriveFile = { id:string; name:string; mimeType:string; parents?:string[]; driveId?:string; trashed?:boolean; thumbnailLink?:string; webViewLink?:string; size?:string; capabilities?:{canDownload?:boolean} };
export const driveId = sharedDriveId;
export const driveConfigured = async(env:AdminEnvironment) => (await connectionStatus(env)).connected;
export async function driveToken(env:AdminEnvironment) {
  if(!await driveConfigured(env)) throw new Error('Connect or reconnect Google Drive to browse this client’s files.');
  const stored=await env.TG_DATA.prepare("SELECT refresh_cipher FROM client_drive_connection WHERE id='organization'").first<{refresh_cipher:string}>();
  if(!stored)throw new Error('Connect Google Drive first.');
  let refresh:string;
  try{refresh=await decryptDriveSecret(env,stored.refresh_cipher);}catch{throw new Error('The Google Drive credential could not be unlocked. Reconnect Google Drive.');}
  const response = await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID!,client_secret:env.GOOGLE_CLIENT_SECRET!,refresh_token:refresh,grant_type:'refresh_token'})});
  const data = await response.json() as {access_token?:string;error?:string};
  if(data.error==='invalid_grant')await env.TG_DATA.prepare("UPDATE client_drive_connection SET needs_reconnect=1 WHERE id='organization' AND refresh_cipher=?").bind(stored.refresh_cipher).run();
  if(!response.ok || !data.access_token) throw new Error('The Google Drive connection needs to be authorized again.');
  return data.access_token;
}
export async function driveRequest<T>(token:string, path:string, init:RequestInit={}) : Promise<T> {
  const send=()=>fetch(`https://www.googleapis.com/drive/v3/${path}`,{...init,headers:{...init.headers,Authorization:`Bearer ${token}`}});
  let response:Response;
  try{response=await send();}catch(error){
    if(init.method && init.method!=='GET')throw error;
    response=await send();
  }
  if((!init.method || init.method==='GET') && [429,502,503,504].includes(response.status)){
    await response.body?.cancel();
    response=await send();
  }
  if(!response.ok) throw new Error(response.status === 403 ? 'The connected account does not have permission for this Drive action.' : 'Google Drive could not complete this request. Please try again.');
  return response.json() as Promise<T>;
}
export async function driveFile(token:string,id:string) {
  if(!/^[\w-]+$/.test(id)) throw new Error('Invalid Drive item.');
  return driveRequest<DriveFile>(token,`files/${id}?supportsAllDrives=true&fields=id,name,mimeType,parents,driveId,trashed,thumbnailLink,webViewLink,size,capabilities(canDownload)`);
}
export async function driveThumbnail(token:string,link:string):Promise<Response|null> {
  let url=new URL(link);
  for(let hop=0;hop<4;hop++) {
    if(url.protocol!=='https:' || url.username || url.password || !(url.hostname.endsWith('.googleusercontent.com') || url.hostname.endsWith('.google.com')))return null;
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},redirect:'manual'});
    if([301,302,303,307,308].includes(response.status)) {
      const location=response.headers.get('location');
      if(!location)return null;
      url=new URL(location,url);continue;
    }
    if(!response.ok || !/^image\/(png|jpeg|webp|gif|avif)(;|$)/i.test(response.headers.get('content-type') || ''))return null;
    return response;
  }
  return null;
}
export async function requireWithin(token:string,id:string,root:string) {
  let file = await driveFile(token,id), current = file;
  for(let depth=0;depth<60;depth++) {
    if(current.trashed) break;
    if(current.id === root) return file;
    if(!current.parents?.[0]) break;
    current = await driveFile(token,current.parents[0]);
  }
  throw new Error('Choose an item inside the linked client folder.');
}
export async function driveFolderPath(token:string,id:string,root:string) {
  const path:{id:string;name:string}[]=[];
  let current=await driveFile(token,id);
  for(let depth=0;depth<60;depth++) {
    if(current.trashed)break;
    path.unshift({id:current.id,name:current.id===root && current.name==='Drive'?'TranterGrey Media':current.name});
    if(current.id===root)return path;
    if(!current.parents?.[0])break;
    current=await driveFile(token,current.parents[0]);
  }
  throw new Error('Choose a folder inside TranterGrey Media.');
}
export async function listDrive(token:string,env:AdminEnvironment,parent:string,page='',foldersOnly=false) {
  if(!/^[\w-]+$/.test(parent))throw new Error('Invalid Drive folder.');
  const params=new URLSearchParams({q:`'${parent}' in parents and trashed = false${foldersOnly ? ` and mimeType = '${folderType}'` : ''}`,corpora:'drive',driveId:driveId(env),supportsAllDrives:'true',includeItemsFromAllDrives:'true',pageSize:'100',orderBy:'folder,name',fields:'nextPageToken,files(id,name,mimeType,webViewLink,thumbnailLink)'});
  if(page) params.set('pageToken',page);
  return driveRequest<{files:DriveFile[];nextPageToken?:string}>(token,`files?${params}`);
}

export async function managedFolder(token:string,env:AdminEnvironment,client:{id:string;drive_folder_id:string|null;drive_managed_folder_id?:string|null}) {
  const root=client.drive_folder_id;if(!root)throw new Error('Choose a client folder first.');
  await requireWithin(token,root,driveId(env));
  if(client.drive_managed_folder_id){
    const folder=await requireWithin(token,client.drive_managed_folder_id,root);
    if(folder.mimeType!==folderType || !folder.parents?.includes(root))throw new Error('The Client HQ folder was moved. Choose the client folder again to repair its link.');
    return folder;
  }
  let page='';const matches:DriveFile[]=[];
  do{const result=await listDrive(token,env,root,page,true);matches.push(...result.files.filter(f=>f.name==='Client HQ'));page=result.nextPageToken || '';}while(page);
  if(matches.length>1)throw new Error('This client has multiple Client HQ folders. Rename the extra folders in Drive before linking.');
  const folder=matches[0] || await createFolder(token,'Client HQ',root);
  await env.TG_DATA.prepare('UPDATE client_directory SET drive_managed_folder_id=? WHERE id=? AND drive_folder_id=?').bind(folder.id,client.id,root).run();
  return folder;
}

export async function withDriveLock<T>(env:AdminEnvironment,id:string,action:()=>Promise<T>) {
  const owner=crypto.randomUUID(),now=new Date().toISOString();
  const lock=await env.TG_DATA.prepare('INSERT INTO client_drive_locks(id,owner,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE client_drive_locks.expires_at<? RETURNING owner').bind(id,owner,new Date(Date.now()+300000).toISOString(),now).first<{owner:string}>();
  if(!lock)throw new Error('Another folder operation is running. Please try again in a moment.');
  try{return await action();}finally{await env.TG_DATA.prepare('DELETE FROM client_drive_locks WHERE id=? AND owner=?').bind(id,owner).run();}
}
export async function createFolder(token:string,name:string,parent:string) {
  return driveRequest<DriveFile>(token,'files?supportsAllDrives=true&fields=id,name,mimeType',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:folderType,parents:[parent]})});
}
