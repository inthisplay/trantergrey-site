import { clientActivity } from '../../_lib/client-activity';
import { adminResponse,type AdminEnvironment } from '../../_lib/admin';
import { driveToken,driveId,requireWithin,folderType,withDriveLock } from '../../_lib/client-drive';
type Pin={folder_id:string;root_id:string;name:string;position:number};
export async function onRequest({request,env}:{request:Request;env:AdminEnvironment}) {
  const denied=await adminResponse(request,env);if(denied)return denied;
  const headers={'Cache-Control':'private, no-store'},url=new URL(request.url),id=url.searchParams.get('client') || '';
  if(!['GET','POST'].includes(request.method))return new Response(null,{status:405});
  if(request.method==='POST' && request.headers.get('origin')!==url.origin)return new Response(null,{status:403});
  try{
    const client=await env.TG_DATA.prepare('SELECT drive_folder_id FROM client_directory WHERE id=?').bind(id).first<{drive_folder_id:string|null}>();
    if(!client)return Response.json({error:'Client not found.'},{status:404,headers});
    const list=async()=>{
      const result=await env.TG_DATA.prepare(`SELECT p.folder_id,p.root_id,p.name,p.position FROM client_drive_pins p
        WHERE p.client_id=? AND (p.root_id=? OR EXISTS(SELECT 1 FROM client_drive_extra_folders e WHERE e.client_id=p.client_id AND e.folder_id=p.root_id))
        ORDER BY p.position,p.folder_id`).bind(id,client.drive_folder_id).all<Pin>();
      return result.results;
    };
    if(request.method==='POST'){
      const body=await request.json() as {action?:string;folder?:string;root?:string;name?:string;direction?:string};
      await withDriveLock(env,'folder-setup',async()=>{
        if(body.action==='pin'){
          const root=body.root || client.drive_folder_id;
          if(!root || (root!==client.drive_folder_id && !await env.TG_DATA.prepare('SELECT folder_id FROM client_drive_extra_folders WHERE client_id=? AND folder_id=?').bind(id,root).first()))throw new Error('Choose a folder inside a linked client folder.');
          const token=await driveToken(env);
          await requireWithin(token,root,driveId(env));
          const folder=await requireWithin(token,body.folder || '',root);
          if(folder.mimeType!==folderType)throw new Error('Only folders can be pinned.');
          await env.TG_DATA.prepare(`INSERT INTO client_drive_pins(client_id,folder_id,root_id,name,position)
            VALUES(?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM client_drive_pins WHERE client_id=?))
            ON CONFLICT(client_id,folder_id) DO UPDATE SET root_id=excluded.root_id`).bind(id,folder.id,root,folder.name,id).run();
        }else if(body.action==='remove'){
          await env.TG_DATA.prepare('DELETE FROM client_drive_pins WHERE client_id=? AND folder_id=?').bind(id,body.folder || '').run();
        }else if(body.action==='rename'){
          const name=typeof body.name==='string'?body.name.trim():'';
          if(!name || name.length>120)throw new Error('Use a shortcut name between 1 and 120 characters.');
          await env.TG_DATA.prepare('UPDATE client_drive_pins SET name=? WHERE client_id=? AND folder_id=?').bind(name,id,body.folder || '').run();
        }else if(body.action==='move'){
          const pins=await list(),index=pins.findIndex(p=>p.folder_id===body.folder);
          if(!['up','down'].includes(body.direction || '') || index<0)throw new Error('Choose a valid pinned folder.');
          const target=index+(body.direction==='up'?-1:1);
          if(target>=0 && target<pins.length){
            [pins[index],pins[target]]=[pins[target],pins[index]];
            await env.TG_DATA.batch(pins.map((p,i)=>env.TG_DATA.prepare('UPDATE client_drive_pins SET position=? WHERE client_id=? AND folder_id=?').bind(i,id,p.folder_id)));
          }
        }else throw new Error('Unknown pin action.');
      });
      await (await clientActivity(request,env,id,'drive_pins',({pin:'Pinned a folder.',remove:'Removed a folder shortcut.',rename:'Renamed a folder shortcut.',move:'Reordered folder shortcuts.'} as Record<string,string>)[body.action || ''] || 'Updated shortcuts.','management')).run();
    }
    return Response.json({pins:await list()},{headers});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to update folder pins.'},{status:400,headers});}
}
