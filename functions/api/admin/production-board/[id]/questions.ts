import { adminResponse, type AdminEnvironment } from '../../../../_lib/admin';
export async function onRequestPatch({request,env,params}:{request:Request;env:AdminEnvironment;params:{id:string}}) {
 const denied=await adminResponse(request,env); if(denied)return denied;
 if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
 const body=await request.json().catch(()=>null);
 if(!body || typeof body.commentId!=='string' || typeof body.addressed!=='boolean')return Response.json({error:'Choose a question and its addressed state.'},{status:400});
 const question=await env.TG_DATA.prepare(`SELECT c.id FROM production_local_comments c JOIN production_cards p ON p.source_id=c.card_source_id LEFT JOIN production_card_overrides o ON o.card_source_id=p.source_id WHERE p.id=? AND c.id=? AND c.is_question=1 AND c.deleted_at IS NULL AND o.deleted_at IS NULL`).bind(params.id,body.commentId).first();
 if(!question)return Response.json({error:'Question not found.'},{status:404});
 const resolvedAt=body.addressed ? new Date().toISOString() : null;
 await env.TG_DATA.prepare('UPDATE production_local_comments SET question_resolved_at=? WHERE id=?').bind(resolvedAt,body.commentId).run();
 return Response.json({questionResolvedAt:resolvedAt});
}
