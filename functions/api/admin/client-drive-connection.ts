import { adminResponse,type AdminEnvironment } from '../../_lib/admin';
import { connectionStatus,startDriveOAuth } from '../../_lib/client-drive-oauth';
export async function onRequest({request,env}:{request:Request;env:AdminEnvironment}) {
  const denied=await adminResponse(request,env);if(denied)return denied;
  const headers={'Cache-Control':'private, no-store'};
  if(request.method==='GET')return Response.json(await connectionStatus(env),{headers});
  if(request.method!=='POST')return new Response(null,{status:405});
  if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
  try {
    const body=await request.json() as {action?:string;client?:string;teamApp?:boolean};
    if(body.action==='connect')return Response.json({authorizationUrl:await startDriveOAuth(request,env,typeof body.client==='string'?body.client:undefined,body.teamApp===true)},{headers});
    if(body.action==='disconnect') {
      await env.TG_DATA.batch([env.TG_DATA.prepare("DELETE FROM client_drive_connection WHERE id='organization'"),env.TG_DATA.prepare('DELETE FROM client_drive_oauth_states'),env.TG_DATA.prepare('DELETE FROM drive_access_cache')]);
      return Response.json({ok:true},{headers});
    }
    return Response.json({error:'Unknown connection action.'},{status:400,headers});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to connect Google Drive.'},{status:400,headers});}
}
