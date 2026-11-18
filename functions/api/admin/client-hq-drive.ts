import { clientActivity } from '../../_lib/client-activity';
import { adminResponse,type AdminEnvironment } from '../../_lib/admin';
import { driveId,driveToken,requireWithin,listDrive,createFolder,folderType,managedFolder,withDriveLock,driveFolderPath,driveThumbnail } from '../../_lib/client-drive';
import { connectionStatus } from '../../_lib/client-drive-oauth';
type Context={request:Request;env:AdminEnvironment};
export async function onRequest({request,env}:Context) {
  const denied=await adminResponse(request,env);if(denied)return denied;
  const url=new URL(request.url), headers={'Cache-Control':'private, no-store'};
  if(request.method==='GET' && url.searchParams.has('status')) return Response.json(await connectionStatus(env),{headers});
  if(!['GET','POST'].includes(request.method))return new Response(null,{status:405});
  if(request.method==='POST' && request.headers.get('origin') && request.headers.get('origin')!==url.origin)return new Response(null,{status:403});
  try {
    const token=await driveToken(env), id=url.searchParams.get('client');
    const client=id ? await env.TG_DATA.prepare('SELECT id,name,drive_folder_id,drive_managed_folder_id FROM client_directory WHERE id=?').bind(id).first<{id:string;name:string;drive_folder_id:string|null;drive_managed_folder_id:string|null}>() : null;
    if(id && !client)return Response.json({error:'Client not found.'},{status:404});
    if(request.method==='GET') {
      if(client?.drive_folder_id) await requireWithin(token,client.drive_folder_id,driveId(env));
      let root=client?.drive_folder_id || driveId(env);
      const extra=url.searchParams.get('root');
      if(client && extra && extra!==client.drive_folder_id){
        if(!await env.TG_DATA.prepare('SELECT folder_id FROM client_drive_extra_folders WHERE client_id=? AND folder_id=?').bind(client.id,extra).first())throw new Error('This folder is not linked to this client.');
        await requireWithin(token,extra,driveId(env));root=extra;
      }
      const managedView=url.searchParams.get('managed')==='1';
      if(managedView && client && !client.drive_managed_folder_id)return Response.json({files:[],path:[],folder:null},{headers});
      if(managedView && client?.drive_managed_folder_id){await requireWithin(token,client.drive_managed_folder_id,root);root=client.drive_managed_folder_id;}
      const parent=url.searchParams.get('folder') || root;
      if(client && !client.drive_folder_id) return Response.json({error:'Choose a Google Drive folder for this client.'},{status:400});
      const thumbnail=url.searchParams.get('thumbnail');
      const file=await requireWithin(token,thumbnail || parent,root);
      if(thumbnail) {
        if(!file.thumbnailLink) return new Response(null,{status:404});
        const image=await driveThumbnail(token,file.thumbnailLink);
        if(!image)return new Response(null,{status:404});
        return new Response(image.body,{headers:{...headers,'Content-Type':image.headers.get('Content-Type') || 'image/jpeg','X-Content-Type-Options':'nosniff'}});
      }
      if(file.mimeType!==folderType)throw new Error('Choose a folder.');
      const data=await listDrive(token,env,parent,url.searchParams.get('page') || '',!client || url.searchParams.get('folders')==='1');
      const path=await driveFolderPath(token,parent,driveId(env));
      return Response.json({...data,path,files:data.files.map(({thumbnailLink,...f})=>({...f,hasThumbnail:Boolean(thumbnailLink)})),folder:{id:parent,name:file.name}},{headers});
    }
    if(!client)throw new Error('Select a client first.');
    if(request.headers.get('Content-Type')?.startsWith('application/json')) {
      const body=await request.json() as {action?:string;folder?:string};
      await withDriveLock(env,'folder-setup',async()=>{
      const current=await env.TG_DATA.prepare('SELECT drive_folder_id FROM client_directory WHERE id=?').bind(client.id).first<{drive_folder_id:string|null}>();
      if(body.action==='link' || body.action==='link-extra') {
        const folder=await requireWithin(token,body.folder || '',driveId(env));
        if(folder.id===driveId(env) || folder.mimeType!==folderType)throw new Error('Choose a client folder, not the shared drive itself.');
        const used=await env.TG_DATA.prepare('SELECT id FROM client_directory WHERE drive_folder_id=? AND id!=?').bind(folder.id,client.id).first();
        if(used)throw new Error('This folder is already linked to another client.');
        if(body.action==='link-extra') {
          if(!current?.drive_folder_id)throw new Error('Choose a primary folder first.');
          if(folder.id===current.drive_folder_id)throw new Error('This is already the primary folder.');
          await env.TG_DATA.prepare('INSERT INTO client_drive_extra_folders(client_id,folder_id,name) VALUES(?,?,?) ON CONFLICT(client_id,folder_id) DO UPDATE SET name=excluded.name').bind(client.id,folder.id,folder.name).run();
          return;
        }
        await env.TG_DATA.prepare('UPDATE client_directory SET drive_folder_id=?,drive_managed_folder_id=CASE WHEN drive_folder_id=? THEN drive_managed_folder_id ELSE NULL END WHERE id=?').bind(folder.id,folder.id,client.id).run();
        await env.TG_DATA.prepare('DELETE FROM client_drive_extra_folders WHERE client_id=? AND folder_id=?').bind(client.id,folder.id).run();
      } else if(body.action==='unlink-primary') {
        if(body.folder!==current?.drive_folder_id)throw new Error('The primary folder has changed. Refresh and try again.');
        await withDriveLock(env,`managed:${client.id}`,async()=>{
          await env.TG_DATA.prepare('UPDATE client_directory SET drive_folder_id=NULL,drive_managed_folder_id=NULL WHERE id=?').bind(client.id).run();
        });return;
      } else if(body.action==='unlink-extra') {
        await env.TG_DATA.prepare('DELETE FROM client_drive_extra_folders WHERE client_id=? AND folder_id=?').bind(client.id,body.folder || '').run();return;
      } else if(body.action==='create-folder') {
        if(current?.drive_folder_id)throw new Error('This client already has a folder.');
        const folder=await createFolder(token,client.name,driveId(env));
        await env.TG_DATA.prepare('UPDATE client_directory SET drive_folder_id=? WHERE id=?').bind(folder.id,client.id).run();
      } else throw new Error('Unknown action.');
      const linked=await env.TG_DATA.prepare('SELECT id,drive_folder_id,drive_managed_folder_id FROM client_directory WHERE id=?').bind(client.id).first<{id:string;drive_folder_id:string;drive_managed_folder_id:string|null}>();
      await withDriveLock(env,`managed:${client.id}`,()=>managedFolder(token,env,linked!));
      });
      await (await clientActivity(request,env,client.id,'drive_folders',({'link':'Linked a primary folder.','link-extra':'Linked another folder.','unlink-primary':'Unlinked the primary folder.','unlink-extra':'Unlinked an additional folder.','create-folder':'Created a client folder.'} as Record<string,string>)[body.action || ''] || 'Updated folders.','management')).run();
      return Response.json({ok:true},{headers});
    }
    if(!client.drive_folder_id)throw new Error('Choose a client folder before uploading.');
    if(Number(request.headers.get('content-length') || 0)>22*1024*1024)return Response.json({error:'Upload files up to 20 MB here; use Google Drive for larger files.'},{status:413});
    const form=await request.formData(), upload=form.get('file');
    if(!(upload instanceof File) || !upload.size || upload.size>20*1024*1024)throw new Error('Choose a file up to 20 MB.');
    await requireWithin(token,client.drive_folder_id,driveId(env));
    const managed=await withDriveLock(env,`managed:${client.id}`,async()=>{
      const latest=await env.TG_DATA.prepare('SELECT id,drive_folder_id,drive_managed_folder_id FROM client_directory WHERE id=?').bind(client.id).first<{id:string;drive_folder_id:string|null;drive_managed_folder_id:string|null}>();
      return managedFolder(token,env,latest!);
    });
    const boundary=`hq_${crypto.randomUUID()}`;
    const metadata=JSON.stringify({name:upload.name,parents:[managed.id]});
    const payload=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${upload.type || 'application/octet-stream'}\r\n\r\n`,upload,`\r\n--${boundary}--`]);
    const response=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':`multipart/related; boundary=${boundary}`},body:payload});
    if(!response.ok)throw new Error('Google Drive could not save this file. Check the connected account’s upload permissions.');
    await (await clientActivity(request,env,client.id,'drive_uploaded',upload.name)).run();
    return Response.json({ok:true,folder:managed},{headers});
  }catch(error){
    const message=error instanceof Error ? error.message : 'Drive is unavailable.';
    const internal=/internal error|network connection|fetch failed/i.test(message);
    return Response.json({error:internal?(request.method==='GET'?'Google Drive is temporarily unavailable. Please try again.':'The upload could not be confirmed. Check Google Drive before uploading the file again.'):message},{status:internal?503:400,headers});
  }
}
