import type { AdminEnvironment } from '../../../../../_lib/admin';
import { apiData,apiError,requireApiScope } from '../../../../../_lib/internal-api';
import { ClientDeletionError,deleteClient,previewClientDeletion } from '../../../../../_lib/delete-client';
export async function onRequest({request,env,params}:{request:Request;env:AdminEnvironment;params:{id:string}}){
 if(!['GET','POST'].includes(request.method))return apiError('method_not_allowed','Use GET or POST.',405);
 const actor=await requireApiScope(request,env,request.method==='GET'?'clients:read':'clients:delete');if(actor instanceof Response)return actor;
 try{
  if(request.method==='GET')return apiData(await previewClientDeletion(env,params.id,actor));
  if(!request.headers.get('content-type')?.startsWith('application/json'))return apiError('invalid_request','Send JSON.',415);
  const reader=request.body?.getReader();if(!reader)return apiError('invalid_request','Send JSON.',400);
  const decoder=new TextDecoder();let text='',size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return apiError('invalid_request','Request too large.',413);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
  const body=JSON.parse(text);
  if(!body||typeof body!=='object'||Array.isArray(body))return apiError('invalid_request','Provide deletion details.',400);
  return apiData(await deleteClient(env,{...body,clientId:params.id},actor));
 }catch(error){if(error instanceof ClientDeletionError)return apiError('client_deletion_failed',error.message,error.status);if(error instanceof SyntaxError)return apiError('invalid_request','Invalid JSON.',400);return apiError('client_deletion_unavailable','Could not confirm deletion. Retry with the same request ID and details.',503);}
}
