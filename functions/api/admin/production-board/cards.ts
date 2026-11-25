import { adminResponse, adminSession, type AdminEnvironment } from '../../../_lib/admin';
import { createProductionCard, CardInputError } from '../../../_lib/create-production-card';
export async function onRequestPost({request,env}:{request:Request;env:AdminEnvironment}) {
  const denied=await adminResponse(request,env);if(denied)return denied;
  const actor=await adminSession(request,env);if(!actor?.email)return Response.json({error:'Sign in to create a card.'},{status:401});
  try {
    const body=await request.json();if(!body || typeof body!=='object')return Response.json({error:'Enter card details.'},{status:400});
    const result=await createProductionCard(env,body,{type:'user',id:actor.email,name:actor.name});
    return Response.json(result,{status:result.created?201:200});
  } catch(error) {if(error instanceof CardInputError)return Response.json({error:error.message},{status:error.status});throw error;}
}
