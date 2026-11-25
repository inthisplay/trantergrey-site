import type { AdminEnvironment } from './admin';
import type { ApiActor } from './internal-api';
import { withDriveLock } from './client-drive';
export class ClientDeletionError extends Error { constructor(message:string,public status=400){super(message);} }
// Canonical metadata snapshot: protects the confirmation from concurrent workspace
// edits and association changes, without copying private note bodies to the ledger.
const snapshotSql = `SELECT json_object('id',c.id,'name',c.name,'root',c.drive_folder_id,
 'extraFolders',json((SELECT json_group_array(folder_id) FROM (SELECT folder_id FROM client_drive_extra_folders WHERE client_id=c.id ORDER BY folder_id))),
 'items',json((SELECT json_group_array(json_object('id',id,'kind',kind,'updatedAt',updated_at)) FROM (SELECT id,kind,updated_at FROM client_workspace_items WHERE workspace_id=c.id ORDER BY id))),
 'cards',json((SELECT json_group_array(id) FROM (SELECT p.id FROM production_cards p JOIN production_card_overrides o ON o.card_source_id=p.source_id WHERE o.deleted_at IS NULL AND o.client=c.name COLLATE NOCASE ORDER BY p.id))),
 'videos',json((SELECT json_group_array(asset_id) FROM (
 SELECT asset_id FROM mux_asset_metadata WHERE client=c.name COLLATE NOCASE
 UNION SELECT b.asset_id FROM mux_library_browse_assets b LEFT JOIN mux_asset_metadata m ON m.asset_id=b.asset_id
 WHERE b.refresh_id=(SELECT refresh_id FROM mux_library_browse_state WHERE id='library') AND b.client=c.name COLLATE NOCASE AND m.client IS NULL ORDER BY asset_id)))
 ) AS snapshot FROM client_directory c WHERE c.id=?`;
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
function checkScope(actor:ApiActor,scope:string){if(!actor.scopes.has(scope))throw new ClientDeletionError('This connection does not have the required client permission.',403);}
async function read(env:AdminEnvironment,id:string){
 if(typeof id!=='string'||!id||id.length>200)throw new ClientDeletionError('Choose an exact client ID.');
 const row=await env.TG_DATA.prepare(snapshotSql).bind(id).first<{snapshot:string}>();
 if(!row)throw new ClientDeletionError('Client not found.',404);
 const data=JSON.parse(row.snapshot) as {id:string;name:string;root:string|null;extraFolders:string[];items:{kind:string}[];cards:string[];videos:string[]};
 return {snapshot:row.snapshot,preview:{clientId:id,name:data.name,expectedVersion:await hash(row.snapshot),notes:data.items.filter(i=>i.kind==='note').length,todos:data.items.filter(i=>i.kind==='todo').length,cards:data.cards.length,muxAssets:data.videos.length,linkedDriveFolders:(data.root?1:0)+data.extraFolders.length,coverage:'Non-deleted Deck cards (including archived/completed); distinct Mux IDs in saved metadata and the current library snapshot. External Mux changes require a library refresh.'}};
}
export async function previewClientDeletion(env:AdminEnvironment,id:string,actor:ApiActor){checkScope(actor,'clients:read');return (await read(env,id)).preview;}
export async function deleteClient(env:AdminEnvironment,input:{clientId:string;expectedVersion:string;confirmName:string;requestId:string},actor:ApiActor){
 checkScope(actor,'clients:delete');
 if(!input||typeof input.clientId!=='string'||typeof input.confirmName!=='string'||typeof input.expectedVersion!=='string'||!/^[a-f0-9]{64}$/.test(input.expectedVersion)||typeof input.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(input.requestId))throw new ClientDeletionError('Provide the exact client, confirmation name, preview version and requestId UUID.');
 const actorId=`${actor.type}:${actor.id}`,payload=JSON.stringify({clientId:input.clientId,expectedVersion:input.expectedVersion,confirmName:input.confirmName});
 const replay=async()=>{const row=await env.TG_DATA.prepare('SELECT payload,result_json FROM client_deletion_requests WHERE actor_id=? AND request_id=?').bind(actorId,input.requestId).first<{payload:string;result_json:string}>();if(!row)return null;if(row.payload!==payload)throw new ClientDeletionError('This request ID was used for different deletion details.',409);return {...JSON.parse(row.result_json),replayed:true};};
 const prior=await replay();if(prior)return prior;
 return withDriveLock(env,'folder-setup',async()=>{
  const concurrent=await replay();if(concurrent)return concurrent;
  const {snapshot,preview}=await read(env,input.clientId);
  if(preview.name!==input.confirmName||preview.expectedVersion!==input.expectedVersion)throw new ClientDeletionError('The client or linked work changed. Review a fresh deletion preview and confirm again.',409);
  const result={clientId:input.clientId,name:preview.name,deleted:true,notesDeleted:preview.notes,todosDeleted:preview.todos,cardsKept:preview.cards,muxAssetsKept:preview.muxAssets,driveFilesKept:true};
  const guard='EXISTS(SELECT 1 FROM client_deletion_requests WHERE actor_id=? AND request_id=?)';
  await env.TG_DATA.batch([
   env.TG_DATA.prepare(`INSERT INTO client_deletion_requests(actor_id,request_id,client_id,payload,result_json,actor_name,created_at) SELECT ?,?,?,?,?,?,? WHERE (${snapshotSql})=?`).bind(actorId,input.requestId,input.clientId,payload,JSON.stringify(result),actor.name,new Date().toISOString(),input.clientId,snapshot),
   env.TG_DATA.prepare(`DELETE FROM client_workspace_items WHERE workspace_id=? AND ${guard}`).bind(input.clientId,actorId,input.requestId),
   env.TG_DATA.prepare(`DELETE FROM client_drive_extra_folders WHERE client_id=? AND ${guard}`).bind(input.clientId,actorId,input.requestId),
   env.TG_DATA.prepare(`DELETE FROM client_directory WHERE id=? AND ${guard}`).bind(input.clientId,actorId,input.requestId),
  ]);
  if(!await replay())throw new ClientDeletionError('The client changed during confirmation. Review a fresh preview.',409);
  return result;
 });
}
